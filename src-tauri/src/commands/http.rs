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
    /// large responses: fetch the bytes from the loopback bridge (`GET bodyUrl`), or `http_body({ id })`
    pub body_id: Option<u64>,
    pub body_url: Option<String>,
}

pub fn build_client(proxy: &str, follow_redirects: bool) -> reqwest::Client {
    let mut builder = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .http1_only()
        .pool_max_idle_per_host(16)
        .pool_idle_timeout(Duration::from_secs(60))
        .tcp_keepalive(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(20))
        .redirect(if follow_redirects { reqwest::redirect::Policy::limited(10) } else { reqwest::redirect::Policy::none() });
    if proxy.is_empty() {
        builder = builder.no_proxy();
    } else if let Ok(p) = reqwest::Proxy::all(proxy) {
        builder = builder.proxy(p);
    }
    builder.build().unwrap_or_else(|_| reqwest::Client::new())
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
    builder = builder.timeout(timeout);
    let started = Instant::now();
    let label = short(&request.url);
    let response = match builder.send().await {
        Ok(r) => r,
        Err(err) => {
            let kind = if err.is_timeout() {
                "timeout"
            } else if err.is_connect() {
                "connect"
            } else if err.is_request() {
                "request"
            } else {
                "error"
            };
            log::warn!("http {} {} failed after {}ms ({kind}): {err}", request.method, label, started.elapsed().as_millis());
            return Err(format!("{kind}: {err}"));
        }
    };
    let status = response.status();
    let final_url = response.url().to_string();
    let headers: Vec<(String, String)> = response.headers().iter().map(|(k, v)| (k.as_str().to_string(), v.to_str().unwrap_or("").to_string())).collect();
    let body = match response.bytes().await {
        Ok(b) => b,
        Err(err) => {
            log::warn!("http {} {} body failed after {}ms: {err}", request.method, label, started.elapsed().as_millis());
            return Err(format!("body: {err}"));
        }
    };
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

/// IPC fallback for bodies parked in the loopback bridge.
#[tauri::command]
pub fn http_body(app: AppHandle, id: u64) -> Result<String, String> {
    let state = app.state::<AppState>();
    match state.body_store.take(id) {
        Some((_, body)) => Ok(base64::engine::general_purpose::STANDARD.encode(body)),
        None => Err("body expired".into()),
    }
}
