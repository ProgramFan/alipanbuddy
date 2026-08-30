//! HTTP for the renderer. The webview cannot talk to Aliyun directly (CORS / forbidden headers),
//! so axios (src/tauri/http.ts) routes every request through this command. One pooled reqwest
//! client, whole body in a single IPC reply, and a log line per request for diagnostics.

use std::time::{Duration, Instant};

use base64::Engine;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequestArg {
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub headers: Vec<(String, String)>,
    /// base64 encoded request body
    #[serde(default)]
    pub body_base64: Option<String>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
    /// "follow" (default) or "manual"
    #[serde(default)]
    pub redirect: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponseOut {
    pub status: u16,
    pub status_text: String,
    pub url: String,
    pub headers: Vec<(String, String)>,
    /// inline body (small responses)
    pub body_base64: String,
    /// large responses: fetch the bytes from the loopback bridge (`GET bodyUrl`), or `http_body_chunk({ id, offset, len })`
    pub body_id: Option<u64>,
    pub body_url: Option<String>,
}

pub fn build_client(proxy: &str, follow_redirects: bool) -> reqwest::Client {
    let mut builder = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .http1_only()
        // gzip only: brotli/deflate decoding of Aliyun's big listing responses failed on a real host
        // ("error decoding response body"); the identity retry below covers the remaining cases.
        .no_brotli()
        .no_deflate()
        .pool_max_idle_per_host(16)
        .pool_idle_timeout(Duration::from_secs(60))
        .tcp_keepalive(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(20))
        // per-read stall limit; the overall body deadline is applied per request below
        .read_timeout(Duration::from_secs(45))
        .redirect(if follow_redirects { reqwest::redirect::Policy::limited(10) } else { reqwest::redirect::Policy::none() });
    if proxy.is_empty() {
        builder = builder.no_proxy();
    } else if let Ok(p) = reqwest::Proxy::all(proxy) {
        builder = builder.proxy(p);
    }
    builder.build().unwrap_or_else(|_| reqwest::Client::new())
}

struct Performed {
    status: reqwest::StatusCode,
    final_url: String,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
}

struct Failure {
    /// headers were received; the failure happened while reading the body
    during_body: bool,
    message: String,
}

/// `Display` of an error plus its `source()` chain (reqwest's top-level messages hide the cause).
fn error_chain(err: &dyn std::error::Error) -> String {
    let mut text = err.to_string();
    let mut cur = err.source();
    while let Some(e) = cur {
        text.push_str(": ");
        text.push_str(&e.to_string());
        cur = e.source();
    }
    text
}

/// Sends the request (deadline `timeout`) and reads the whole body (own, longer deadline).
async fn perform(builder: reqwest::RequestBuilder, timeout: Duration, method: &str, label: &str, started: Instant) -> Result<Performed, Failure> {
    let response = match tokio::time::timeout(timeout, builder.send()).await {
        Ok(Ok(r)) => r,
        Ok(Err(err)) => {
            let kind = if err.is_timeout() {
                "timeout"
            } else if err.is_connect() {
                "connect"
            } else if err.is_request() {
                "request"
            } else {
                "error"
            };
            let chain = error_chain(&err);
            log::warn!("http {method} {label} failed after {}ms ({kind}): {chain}", started.elapsed().as_millis());
            return Err(Failure { during_body: false, message: format!("{kind}: {chain}") });
        }
        Err(_) => {
            log::warn!("http {method} {label} timed out after {}ms (headers)", started.elapsed().as_millis());
            return Err(Failure { during_body: false, message: format!("timeout: no response within {}ms", timeout.as_millis()) });
        }
    };
    let status = response.status();
    let final_url = response.url().to_string();
    let headers: Vec<(String, String)> = response.headers().iter().map(|(k, v)| (k.as_str().to_string(), v.to_str().unwrap_or("").to_string())).collect();
    let body_timeout = timeout.max(Duration::from_secs(120));
    let body = match tokio::time::timeout(body_timeout, response.bytes()).await {
        Ok(Ok(b)) => b.to_vec(),
        Ok(Err(err)) => {
            let chain = error_chain(&err);
            log::warn!("http {method} {label} body failed after {}ms: {chain}", started.elapsed().as_millis());
            return Err(Failure { during_body: true, message: format!("body: {chain}") });
        }
        Err(_) => {
            log::warn!("http {method} {label} body timed out after {}ms", started.elapsed().as_millis());
            return Err(Failure { during_body: true, message: format!("body: timeout after {}ms", body_timeout.as_millis()) });
        }
    };
    Ok(Performed { status, final_url, headers, body })
}

/// A body-read retry re-sends the request, so only do it for reads (the server already executed the
/// first one).
fn retry_is_safe(method: &reqwest::Method, url: &str) -> bool {
    if *method == reqwest::Method::GET || *method == reqwest::Method::HEAD {
        return true;
    }
    if *method != reqwest::Method::POST {
        return false;
    }
    let path = url.split('?').next().unwrap_or("").to_ascii_lowercase();
    if path.contains("/batch") {
        return false;
    }
    path.contains("list") || path.contains("search") || path.ends_with("/get") || path.contains("/get_") || path.contains("getdownloadurl") || path.contains("download_url") || path.contains("/info")
}

fn short(url: &str) -> String {
    match url.find('?') {
        Some(i) if url.len() > i + 48 => format!("{}?{}…", &url[..i], &url[i + 1..i + 40]),
        _ => url.to_string(),
    }
}

#[tauri::command]
pub async fn http_request(app: AppHandle, request: HttpRequestArg) -> Result<HttpResponseOut, String> {
    let manual = request.redirect.as_deref() == Some("manual");
    let client = {
        let state = app.state::<AppState>();
        let guard = state.http_clients.lock();
        if manual {
            guard.1.clone()
        } else {
            guard.0.clone()
        }
    };
    let method = reqwest::Method::from_bytes(request.method.to_ascii_uppercase().as_bytes()).map_err(|e| e.to_string())?;
    let mut builder = client.request(method.clone(), &request.url);
    for (name, value) in &request.headers {
        builder = builder.header(name.as_str(), value.as_str());
    }
    if let Some(b64) = request.body_base64.as_deref().filter(|b| !b.is_empty()) {
        let bytes = base64::engine::general_purpose::STANDARD.decode(b64).map_err(|e| format!("invalid body: {e}"))?;
        builder = builder.body(bytes);
    }
    let timeout = Duration::from_millis(request.timeout_ms.filter(|t| *t > 0).unwrap_or(30_000));
    let label = short(&request.url);
    let started = Instant::now();
    let mut attempt = perform(builder, timeout, &request.method, &label, started).await;
    if let Err(Failure { during_body: true, ref message }) = attempt {
        if retry_is_safe(&method, &request.url) {
            // The headers arrived but the (compressed) body could not be read/decoded: fetch it once
            // more on a fresh request without content encoding.
            log::warn!("http {} {} retrying uncompressed after body failure: {message}", request.method, label);
            let mut retry = client.request(method.clone(), &request.url);
            for (name, value) in &request.headers {
                if !name.eq_ignore_ascii_case("accept-encoding") {
                    retry = retry.header(name.as_str(), value.as_str());
                }
            }
            retry = retry.header(reqwest::header::ACCEPT_ENCODING, "identity");
            if let Some(b64) = request.body_base64.as_deref().filter(|b| !b.is_empty()) {
                if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(b64) {
                    retry = retry.body(bytes);
                }
            }
            attempt = perform(retry, timeout, &request.method, &label, Instant::now()).await;
        }
    }
    let Performed { status, final_url, headers, body } = attempt.map_err(|f| f.message)?;
    log::info!("http {} {} -> {} {}B in {}ms", request.method, label, status.as_u16(), body.len(), started.elapsed().as_millis());
    let state = app.state::<AppState>();
    let bridge_port = *state.bridge_port.lock();
    let (body_base64, body_id, body_url) = if body.len() > crate::bridge::INLINE_LIMIT && bridge_port > 0 {
        let content_type = headers.iter().find(|(k, _)| k == "content-type").map(|(_, v)| v.clone()).unwrap_or_default();
        let id = state.body_store.insert(content_type, body.to_vec());
        (String::new(), Some(id), Some(format!("http://127.0.0.1:{bridge_port}/body/{id}")))
    } else {
        (base64::engine::general_purpose::STANDARD.encode(&body), None, None)
    };
    Ok(HttpResponseOut { status: status.as_u16(), status_text: status.canonical_reason().unwrap_or("").to_string(), url: final_url, headers, body_base64, body_id, body_url })
}

/// Chunked IPC fallback for bodies parked in the loopback bridge (large single IPC replies were
/// unreliable on some WebKitGTK builds).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BodyChunk {
    pub data: String,
    pub total: usize,
}

#[tauri::command]
pub fn http_body_chunk(app: AppHandle, id: u64, offset: usize, len: usize) -> Result<BodyChunk, String> {
    let state = app.state::<AppState>();
    match state.body_store.chunk(id, offset, len.clamp(1, 4 * 1024 * 1024)) {
        Some((bytes, total)) => Ok(BodyChunk { data: base64::engine::general_purpose::STANDARD.encode(bytes), total }),
        None => Err("body expired".into()),
    }
}

#[tauri::command]
pub fn http_body_release(app: AppHandle, id: u64) {
    app.state::<AppState>().body_store.release(id);
}

#[cfg(test)]
mod tests {
    use super::retry_is_safe;
    use reqwest::Method;

    #[test]
    fn body_retry_only_for_reads() {
        assert!(retry_is_safe(&Method::GET, "https://api.aliyundrive.com/anything"));
        assert!(retry_is_safe(&Method::POST, "https://api.aliyundrive.com/adrive/v1/album/list_files"));
        assert!(retry_is_safe(&Method::POST, "https://api.aliyundrive.com/adrive/v3/file/list?x=1"));
        assert!(retry_is_safe(&Method::POST, "https://api.aliyundrive.com/adrive/v2/file/search"));
        assert!(retry_is_safe(&Method::POST, "https://api.aliyundrive.com/adrive/v1/album/get"));
        assert!(retry_is_safe(&Method::POST, "https://api.aliyundrive.com/v2/file/get_download_url"));
        assert!(!retry_is_safe(&Method::POST, "https://api.aliyundrive.com/adrive/v1/album/create"));
        assert!(!retry_is_safe(&Method::POST, "https://api.aliyundrive.com/v3/batch"));
        assert!(!retry_is_safe(&Method::POST, "https://api.aliyundrive.com/adrive/v2/file/delete"));
        assert!(!retry_is_safe(&Method::PUT, "https://upload/list"));
    }
}
