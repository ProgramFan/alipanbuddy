//! Local HTTP proxy that streams Aliyun Drive downloads to the image viewer / external players,
//! transparently decrypting `xbyEncrypt` files. Port of `src/utils/proxyhelper.ts#createProxyServer`.

use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::{header, HeaderMap, HeaderName, HeaderValue, Method, StatusCode};
use axum::response::Response;
use axum::Router;
use bytes::Bytes;
use futures_util::StreamExt;
use parking_lot::Mutex;
use percent_encoding::{percent_decode_str, utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use tokio::sync::oneshot;
use tokio::task::JoinHandle;

use crate::flowenc::{Alg, FlowEnc};
use crate::namecodec::decode_name;

/// `encodeURIComponent` keeps `- _ . ! ~ * ' ( )`.
const URI_COMPONENT: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'!')
    .remove(b'~')
    .remove(b'*')
    .remove(b'\'')
    .remove(b'(')
    .remove(b')');

pub fn encode_uri_component(s: &str) -> String {
    utf8_percent_encode(s, URI_COMPONENT).to_string()
}

#[derive(Debug, Clone)]
pub struct ResolveRequest {
    pub user_id: String,
    pub drive_id: String,
    pub file_id: String,
}

pub type UrlResolverFuture = Pin<Box<dyn Future<Output = Option<String>> + Send>>;
/// Asks the renderer for a fresh download url (it owns the account tokens).
pub type UrlResolver = Arc<dyn Fn(ResolveRequest) -> UrlResolverFuture + Send + Sync>;

#[derive(Debug, Clone)]
struct CachedUrl {
    file_id: String,
    url: String,
    expires_ms: u64,
}

#[derive(Clone)]
pub struct ProxyContext {
    pub client: reqwest::Client,
    pub resolver: UrlResolver,
    cache: Arc<Mutex<Option<CachedUrl>>>,
}

impl ProxyContext {
    pub fn new(client: reqwest::Client, resolver: UrlResolver) -> Self {
        ProxyContext { client, resolver, cache: Arc::new(Mutex::new(None)) }
    }
}

pub struct ProxyServer {
    pub port: u16,
    shutdown: Option<oneshot::Sender<()>>,
    handle: JoinHandle<()>,
}

impl ProxyServer {
    /// Binds `0.0.0.0:port` (the proxy may be used by other devices on the LAN).
    pub async fn start(port: u16, ctx: ProxyContext) -> std::io::Result<ProxyServer> {
        let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await?;
        let port = listener.local_addr()?.port();
        let app = Router::new().fallback(handle).with_state(ctx);
        let (tx, rx) = oneshot::channel::<()>();
        let handle = tokio::spawn(async move {
            let _ = axum::serve(listener, app)
                .with_graceful_shutdown(async move {
                    let _ = rx.await;
                })
                .await;
        });
        Ok(ProxyServer { port, shutdown: Some(tx), handle })
    }

    pub fn stop(mut self) {
        if let Some(tx) = self.shutdown.take() {
            let _ = tx.send(());
        }
        self.handle.abort();
    }
}

impl Drop for ProxyServer {
    fn drop(&mut self) {
        if let Some(tx) = self.shutdown.take() {
            let _ = tx.send(());
        }
    }
}

fn parse_query(query: Option<&str>) -> HashMap<String, String> {
    let mut map = HashMap::new();
    if let Some(q) = query {
        for pair in q.split('&') {
            if pair.is_empty() {
                continue;
            }
            let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
            let k = percent_decode_str(&k.replace('+', " ")).decode_utf8_lossy().into_owned();
            let v = percent_decode_str(&v.replace('+', " ")).decode_utf8_lossy().into_owned();
            map.insert(k, v);
        }
    }
    map
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// `GetExpiresTime(url)` - the `x-oss-expires` timestamp in milliseconds (0 if absent).
pub fn get_expires_ms(url: &str) -> u64 {
    let decoded = percent_decode_str(url).decode_utf8_lossy();
    let Some(idx) = decoded.find("x-oss-expires=") else { return 0 };
    let rest = &decoded[idx + "x-oss-expires=".len()..];
    let value = rest.split('&').next().unwrap_or("");
    value.parse::<u64>().map(|v| v * 1000).unwrap_or(0)
}

/// `getUrlFileName(url)` - the `filename*=UTF-8''name` part of a `response-content-disposition` query.
pub fn get_url_file_name(url: &str) -> String {
    let decoded = percent_decode_str(url).decode_utf8_lossy();
    let Some(idx) = decoded.find("filename") else { return String::new() };
    let after = &decoded[idx + "filename".len()..];
    let after = after.strip_prefix('*').unwrap_or(after);
    let Some(after) = after.strip_prefix('=') else { return String::new() };
    // [^=;]*;?''
    let mut chars = after.char_indices().peekable();
    let mut quote_at = None;
    while let Some((i, ch)) = chars.next() {
        if ch == '=' {
            return String::new();
        }
        if ch == ';' {
            if after[i + 1..].starts_with("''") {
                quote_at = Some(i + 1);
                break;
            }
            return String::new();
        }
        if ch == '\'' && after[i..].starts_with("''") {
            quote_at = Some(i);
            break;
        }
    }
    let Some(q) = quote_at else { return String::new() };
    let name = &after[q + 2..];
    name.split('&').next().unwrap_or("").to_string()
}

fn file_ext(name: &str) -> &str {
    match name.rfind('.') {
        Some(i) if i > 0 && i + 1 < name.len() => &name[i..],
        _ => "",
    }
}

fn should_refresh(file_id: &str, proxy_url: &str, cached: &Option<CachedUrl>) -> bool {
    let need_refresh = cached.as_ref().map(|c| file_id != c.file_id || c.expires_ms <= now_ms()).unwrap_or(false);
    proxy_url.is_empty() || need_refresh
}

const DROPPED_UPSTREAM_HEADERS: &[&str] = &[
    "host",
    "connection",
    "proxy-connection",
    "keep-alive",
    "transfer-encoding",
    "upgrade",
    "te",
    "trailer",
    "referer",
    "authorization",
    "if-none-match",
    "if-modified-since",
];

/// `buildUpstreamProxyHeaders` + `ensureInlinePreviewRange`
pub fn build_upstream_headers(incoming: &HeaderMap, proxy_headers: &str, inline: bool) -> HeaderMap {
    let mut headers = HeaderMap::new();
    for (name, value) in incoming.iter() {
        let key = name.as_str().to_ascii_lowercase();
        if DROPPED_UPSTREAM_HEADERS.contains(&key.as_str()) {
            continue;
        }
        headers.append(name.clone(), value.clone());
    }
    headers.insert(header::ACCEPT_ENCODING, HeaderValue::from_static("identity"));
    if !proxy_headers.is_empty() {
        match serde_json::from_str::<HashMap<String, serde_json::Value>>(proxy_headers) {
            Ok(extra) => {
                for (k, v) in extra {
                    let v = match v {
                        serde_json::Value::String(s) => s,
                        serde_json::Value::Null => continue,
                        other => other.to_string(),
                    };
                    if v.is_empty() {
                        continue;
                    }
                    if let (Ok(name), Ok(value)) = (HeaderName::from_bytes(k.to_ascii_lowercase().as_bytes()), HeaderValue::from_str(&v)) {
                        headers.insert(name, value);
                    }
                }
            }
            Err(err) => log::warn!("proxy_headers parse error: {err}"),
        }
    }
    if inline && !headers.contains_key(header::RANGE) {
        headers.insert(header::RANGE, HeaderValue::from_static("bytes=0-"));
    }
    headers
}

/// `normalizeProxyStatusCode`
pub fn normalize_status(status: u16, has_content_range: bool) -> u16 {
    if status == 200 && has_content_range {
        206
    } else {
        status
    }
}

fn range_start(headers: &HeaderMap) -> u64 {
    headers
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())
        .and_then(|r| r.strip_prefix("bytes="))
        .and_then(|r| r.split('-').next())
        .and_then(|s| s.trim().parse::<u64>().ok())
        .unwrap_or(0)
}

fn text_response(status: StatusCode, body: &'static str) -> Response {
    Response::builder().status(status).header(header::CONTENT_TYPE, "text/plain").body(Body::from(body)).unwrap()
}

fn redirect_response(location: &str) -> Response {
    Response::builder().status(StatusCode::FOUND).header(header::LOCATION, location).body(Body::empty()).unwrap()
}

async fn handle(State(ctx): State<ProxyContext>, req: Request) -> Response {
    let path = req.uri().path().to_string();
    let query = parse_query(req.uri().query());
    match path.as_str() {
        "/proxy" => proxy(ctx, req, query).await,
        "/redirect" => match query.get("proxy_url") {
            Some(url) if !url.is_empty() => redirect_response(url),
            _ => text_response(StatusCode::NOT_FOUND, "missing proxy_url"),
        },
        _ => text_response(StatusCode::NOT_FOUND, "not found"),
    }
}

async fn proxy(ctx: ProxyContext, req: Request, query: HashMap<String, String>) -> Response {
    let q = |k: &str| query.get(k).cloned().unwrap_or_default();
    let user_id = q("user_id");
    let drive_id = q("drive_id");
    let file_id = q("file_id");
    let file_size: u64 = q("file_size").parse().unwrap_or(0);
    let enc_type = q("encType");
    let enc_alg = q("enc_alg");
    let enc_password = q("enc_password");
    let decrypt_name = q("decrypt_name") == "1" || q("decrypt_name") == "true";
    let proxy_kind = q("proxy_kind");
    let content_disposition = q("content_disposition");
    let file_name = q("file_name");
    let proxy_headers = q("proxy_headers");

    let mut cached = ctx.cache.lock().clone();
    let mut proxy_url = q("proxy_url");
    if proxy_url.is_empty() {
        if let Some(c) = &cached {
            proxy_url = c.url.clone();
        }
    }
    if should_refresh(&file_id, &proxy_url, &cached) {
        let fresh = (ctx.resolver)(ResolveRequest { user_id: user_id.clone(), drive_id: drive_id.clone(), file_id: file_id.clone() }).await;
        if let Some(url) = fresh.filter(|u| !u.is_empty()) {
            proxy_url = url;
            cached = None;
        }
    }
    if proxy_url.is_empty() {
        *ctx.cache.lock() = None;
        return text_response(StatusCode::NOT_FOUND, "");
    } else if cached.is_none() && proxy_kind != "subtitle" {
        *ctx.cache.lock() = Some(CachedUrl { file_id: file_id.clone(), url: proxy_url.clone(), expires_ms: get_expires_ms(&proxy_url) });
    }
    // 转码文件302重定向
    if proxy_url.contains(".aliyuncs.com") {
        return redirect_response(&proxy_url);
    }

    let inline = content_disposition == "inline";
    let upstream_headers = build_upstream_headers(req.headers(), &proxy_headers, inline);
    let start = range_start(&upstream_headers);

    let mut flow: Option<FlowEnc> = None;
    if !enc_type.is_empty() {
        match Alg::parse(&enc_alg).ok_or(()).and_then(|alg| FlowEnc::new(&enc_password, alg, file_size).map_err(|_| ())) {
            Ok(mut f) => {
                if start > 0 {
                    f.set_position(start);
                }
                flow = Some(f);
            }
            Err(()) => return text_response(StatusCode::BAD_REQUEST, "unsupported encryption"),
        }
    }

    let method = if req.method() == Method::HEAD { Method::HEAD } else { Method::GET };
    let is_get = method == Method::GET;
    let upstream = match ctx.client.request(method, &proxy_url).headers(upstream_headers).send().await {
        Ok(r) => r,
        Err(err) => {
            log::warn!("proxy upstream error: {err}");
            return text_response(StatusCode::BAD_GATEWAY, "upstream error");
        }
    };

    let status = upstream.status().as_u16();
    let has_content_range = upstream.headers().contains_key(header::CONTENT_RANGE);
    let mut builder = Response::builder().status(normalize_status(status, has_content_range));
    let mut accept_ranges_bytes = false;
    if let Some(v) = upstream.headers().get(header::ACCEPT_RANGES).and_then(|v| v.to_str().ok()) {
        let values: Vec<&str> = v.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
        accept_ranges_bytes = has_content_range && !values.is_empty() && values.iter().all(|s| s.eq_ignore_ascii_case("bytes"));
    }
    for (name, value) in upstream.headers().iter() {
        let key = name.as_str();
        if matches!(key, "connection" | "transfer-encoding" | "keep-alive" | "content-encoding") {
            continue;
        }
        if accept_ranges_bytes && key == "accept-ranges" {
            builder = builder.header(header::ACCEPT_RANGES, "bytes");
            continue;
        }
        builder = builder.header(name, value);
    }
    let hmap = builder.headers_mut().unwrap();
    if inline {
        let name = if !file_name.is_empty() { file_name.clone() } else { get_url_file_name(&proxy_url) };
        let name = if name.is_empty() { "preview".to_string() } else { name };
        let cd = format!("inline; filename*=UTF-8''{};", encode_uri_component(&name));
        if let Ok(v) = HeaderValue::from_str(&cd) {
            hmap.insert(header::CONTENT_DISPOSITION, v);
        }
    }
    // 解密文件名
    if is_get && status == 200 && !enc_type.is_empty() && decrypt_name {
        let name = get_url_file_name(&proxy_url);
        if !name.is_empty() {
            let ext = file_ext(&name).to_string();
            let stem = &name[..name.len() - ext.len()];
            if let Some(alg) = Alg::parse(&enc_alg) {
                let dec = decode_name(&enc_password, alg, stem).unwrap_or_default();
                let cd = format!("attachment; filename*=UTF-8''{};", encode_uri_component(&format!("{dec}{ext}")));
                if let Ok(v) = HeaderValue::from_str(&cd) {
                    hmap.insert(header::CONTENT_DISPOSITION, v);
                }
            }
        }
    }

    if !is_get {
        return builder.body(Body::empty()).unwrap();
    }
    let stream = upstream.bytes_stream().map(move |chunk| match chunk {
        Ok(bytes) => {
            if let Some(f) = flow.as_mut() {
                let mut data = bytes.to_vec();
                f.process(&mut data);
                Ok(Bytes::from(data))
            } else {
                Ok(bytes)
            }
        }
        Err(err) => Err(std::io::Error::other(err)),
    });
    builder.body(Body::from_stream(stream)).unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expires_parsing() {
        assert_eq!(get_expires_ms("https://x/y?a=1&x-oss-expires=1700000000&b=2"), 1_700_000_000_000);
        assert_eq!(get_expires_ms("https://x/y?x-oss-expires%3D1700000000"), 1_700_000_000_000);
        assert_eq!(get_expires_ms("https://x/y"), 0);
    }

    #[test]
    fn url_file_name() {
        let url = "https://host/f?response-content-disposition=attachment%3B%20filename%2A%3DUTF-8%27%27hello%2520w.txt&x=1";
        assert_eq!(get_url_file_name(url), "hello%20w.txt");
        assert_eq!(get_url_file_name("https://host/f?filename=abc"), "");
        assert_eq!(get_url_file_name("https://host/f"), "");
    }

    #[test]
    fn header_rules() {
        let mut incoming = HeaderMap::new();
        incoming.insert(header::HOST, HeaderValue::from_static("localhost"));
        incoming.insert(header::AUTHORIZATION, HeaderValue::from_static("secret"));
        incoming.insert(header::USER_AGENT, HeaderValue::from_static("ua"));
        let h = build_upstream_headers(&incoming, r#"{"X-Extra":"1","Empty":""}"#, true);
        assert!(!h.contains_key(header::HOST));
        assert!(!h.contains_key(header::AUTHORIZATION));
        assert_eq!(h.get(header::USER_AGENT).unwrap(), "ua");
        assert_eq!(h.get("x-extra").unwrap(), "1");
        assert!(!h.contains_key("empty"));
        assert_eq!(h.get(header::RANGE).unwrap(), "bytes=0-");
        assert_eq!(h.get(header::ACCEPT_ENCODING).unwrap(), "identity");
        assert_eq!(normalize_status(200, true), 206);
        assert_eq!(normalize_status(200, false), 200);
        assert_eq!(normalize_status(404, true), 404);
    }

    #[test]
    fn uri_component() {
        assert_eq!(encode_uri_component("a b/中.txt"), "a%20b%2F%E4%B8%AD.txt");
    }

    #[tokio::test]
    async fn serves_redirect_and_404() {
        let resolver: UrlResolver = Arc::new(|_| Box::pin(async { None }));
        let ctx = ProxyContext::new(reqwest::Client::new(), resolver);
        let server = ProxyServer::start(0, ctx).await.unwrap();
        let client = reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).build().unwrap();
        let resp = client.get(format!("http://127.0.0.1:{}/redirect?proxy_url=http%3A%2F%2Fexample.com%2Fx", server.port)).send().await.unwrap();
        assert_eq!(resp.status().as_u16(), 302);
        assert_eq!(resp.headers().get(header::LOCATION).unwrap(), "http://example.com/x");
        let resp = client.get(format!("http://127.0.0.1:{}/proxy?file_id=1", server.port)).send().await.unwrap();
        assert_eq!(resp.status().as_u16(), 404);
        let resp = client.get(format!("http://127.0.0.1:{}/nope", server.port)).send().await.unwrap();
        assert_eq!(resp.status().as_u16(), 404);
        server.stop();
    }

    #[tokio::test]
    async fn proxies_and_decrypts_through_upstream() {
        // upstream: another proxy instance is overkill; use a tiny axum server returning encrypted bytes
        let plain: Vec<u8> = (0..3000u32).map(|i| (i % 251) as u8).collect();
        let mut enc = plain.clone();
        FlowEnc::new("pw", Alg::AesCtr, plain.len() as u64).unwrap().process(&mut enc);
        let enc_arc = Arc::new(enc);
        let upstream_app = Router::new().fallback({
            let enc_arc = enc_arc.clone();
            move |req: Request| {
                let enc_arc = enc_arc.clone();
                async move {
                    let start = range_start(req.headers()) as usize;
                    let body = enc_arc[start..].to_vec();
                    let total = enc_arc.len();
                    Response::builder()
                        .status(if start > 0 { 206 } else { 200 })
                        .header(header::CONTENT_RANGE, format!("bytes {}-{}/{}", start, total - 1, total))
                        .header(header::ACCEPT_RANGES, "bytes")
                        .body(Body::from(body))
                        .unwrap()
                }
            }
        });
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let upstream_port = listener.local_addr().unwrap().port();
        tokio::spawn(async move { axum::serve(listener, upstream_app).await.unwrap() });

        let resolver: UrlResolver = Arc::new(|_| Box::pin(async { None }));
        let ctx = ProxyContext::new(reqwest::Client::new(), resolver);
        let server = ProxyServer::start(0, ctx).await.unwrap();
        let upstream_url = encode_uri_component(&format!("http://127.0.0.1:{upstream_port}/file"));
        let url = format!(
            "http://127.0.0.1:{}/proxy?user_id=u&drive_id=d&file_id=f&file_size={}&encType=xbyEncrypt1&enc_alg=aesctr&enc_password=pw&proxy_url={}",
            server.port,
            plain.len(),
            upstream_url
        );
        let client = reqwest::Client::new();
        let resp = client.get(&url).send().await.unwrap();
        assert_eq!(resp.status().as_u16(), 206);
        assert_eq!(resp.headers().get(header::ACCEPT_RANGES).unwrap(), "bytes");
        assert_eq!(resp.bytes().await.unwrap().to_vec(), plain);
        let resp = client.get(&url).header(header::RANGE, "bytes=1000-").send().await.unwrap();
        assert_eq!(resp.status().as_u16(), 206);
        assert_eq!(resp.bytes().await.unwrap().to_vec(), plain[1000..].to_vec());
        server.stop();
    }
}
