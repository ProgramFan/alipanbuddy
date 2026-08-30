//! Local decrypting proxy server (boxcore::proxy) lifecycle + the renderer callback that supplies
//! fresh download urls.

use std::sync::Arc;
use std::time::Duration;

use boxcore::proxy::{ProxyContext, ProxyServer, ResolveRequest, TokenLookup, UrlResolver};
use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::oneshot;

use crate::state::AppState;
use crate::windows::MAIN;

fn build_resolver(app: AppHandle) -> UrlResolver {
    Arc::new(move |req: ResolveRequest| {
        let app = app.clone();
        Box::pin(async move {
            let state = app.state::<AppState>();
            let id = state.next_id();
            let (tx, rx) = oneshot::channel::<String>();
            state.pending_urls.lock().insert(id.clone(), tx);
            let _ = app.emit_to(MAIN, "proxy-need-url", json!({ "id": id, "userId": req.user_id, "driveId": req.drive_id, "fileId": req.file_id }));
            let result = tokio::time::timeout(Duration::from_secs(20), rx).await;
            app.state::<AppState>().pending_urls.lock().remove(&id);
            match result {
                Ok(Ok(url)) if !url.is_empty() => Some(url),
                _ => None,
            }
        })
    })
}

pub fn build_context(app: &AppHandle) -> ProxyContext {
    let proxy = app.state::<AppState>().http_proxy.lock().clone();
    let mut builder = reqwest::Client::builder().danger_accept_invalid_certs(true).pool_max_idle_per_host(16).connect_timeout(Duration::from_secs(15));
    if !proxy.is_empty() {
        if let Ok(p) = reqwest::Proxy::all(&proxy) {
            builder = builder.proxy(p);
        }
    } else {
        builder = builder.no_proxy();
    }
    let client = builder.build().unwrap_or_else(|_| reqwest::Client::new());
    let tokens = app.state::<AppState>().user_tokens.clone();
    let lookup: TokenLookup = Arc::new(move |user_id: &str| tokens.lock().get(user_id).cloned());
    ProxyContext::new(client, build_resolver(app.clone())).with_tokens(lookup)
}

pub async fn start_server(app: &AppHandle, port: u16) -> Result<u16, String> {
    let state = app.state::<AppState>();
    let mut guard = state.proxy.lock().await;
    if let Some(server) = guard.take() {
        server.stop();
    }
    let ctx = build_context(app);
    let server = match ProxyServer::start(port, ctx).await {
        Ok(s) => s,
        Err(err) => {
            log::warn!("proxy port {port} unavailable ({err}), picking a free one");
            let fallback = boxcore::aria::find_free_port(18888);
            ProxyServer::start(fallback, build_context(app)).await.map_err(|e| e.to_string())?
        }
    };
    let actual = server.port;
    *state.proxy_port.lock() = actual;
    *guard = Some(server);
    Ok(actual)
}

pub async fn stop_server(app: &AppHandle) {
    let state = app.state::<AppState>();
    if let Some(server) = state.proxy.lock().await.take() {
        server.stop();
    }
    *state.proxy_port.lock() = 0;
}

#[tauri::command]
pub async fn proxy_start(app: AppHandle, port: u16) -> Result<u16, String> {
    start_server(&app, port).await
}

#[tauri::command]
pub async fn proxy_stop(app: AppHandle) {
    stop_server(&app).await;
}

#[derive(Serialize)]
pub struct ProxyStatus {
    running: bool,
    port: u16,
}

#[tauri::command]
pub async fn proxy_status(app: AppHandle) -> ProxyStatus {
    let state = app.state::<AppState>();
    let running = state.proxy.lock().await.is_some();
    let port = *state.proxy_port.lock();
    ProxyStatus { running, port }
}

#[tauri::command]
pub fn proxy_provide_url(app: AppHandle, id: String, url: String) {
    if let Some(tx) = app.state::<AppState>().pending_urls.lock().remove(&id) {
        let _ = tx.send(url);
    }
}

/// Renderer pushes the web-API access token of each account (login / refresh) so `/image` can authenticate.
#[tauri::command]
pub fn proxy_set_token(app: AppHandle, user_id: String, access_token: String) {
    if user_id.is_empty() || access_token.is_empty() {
        return;
    }
    app.state::<AppState>().user_tokens.lock().insert(user_id, access_token);
}

#[tauri::command]
pub fn get_local_ip() -> String {
    local_ip_address::local_ip().map(|ip| ip.to_string()).unwrap_or_else(|_| "127.0.0.1".to_string())
}

#[tauri::command]
pub fn find_free_port(port: u16) -> u16 {
    boxcore::aria::find_free_port(port)
}
