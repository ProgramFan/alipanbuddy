//! Loopback HTTP "bridge" that hands large response bodies to the webview over plain HTTP
//! instead of the Tauri IPC channel (which is slow / unreliable for multi-MB payloads and many
//! concurrent replies on some WebKitGTK versions).

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::{header, StatusCode};
use axum::response::Response;
use axum::routing::get;
use axum::Router;
use parking_lot::Mutex;

/// Bodies smaller than this are inlined (base64) in the IPC reply.
pub const INLINE_LIMIT: usize = 128 * 1024;
const TTL: Duration = Duration::from_secs(120);

#[derive(Default)]
pub struct BodyStore {
    next: AtomicU64,
    items: Mutex<HashMap<u64, (Instant, String, Vec<u8>)>>,
}

impl BodyStore {
    pub fn insert(&self, content_type: String, body: Vec<u8>) -> u64 {
        let id = self.next.fetch_add(1, Ordering::Relaxed) + 1;
        let mut items = self.items.lock();
        let now = Instant::now();
        items.retain(|_, (t, _, _)| now.duration_since(*t) < TTL);
        items.insert(id, (now, content_type, body));
        id
    }

    pub fn take(&self, id: u64) -> Option<(String, Vec<u8>)> {
        self.items.lock().remove(&id).map(|(_, ct, b)| (ct, b))
    }
}

#[derive(Clone)]
struct BridgeState {
    store: Arc<BodyStore>,
}

async fn serve_body(State(state): State<BridgeState>, Path(id): Path<u64>) -> Response {
    match state.store.take(id) {
        Some((content_type, body)) => Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, if content_type.is_empty() { "application/octet-stream".to_string() } else { content_type })
            .header(header::CONTENT_LENGTH, body.len())
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .header(header::CACHE_CONTROL, "no-store")
            .body(Body::from(body))
            .unwrap(),
        None => Response::builder().status(StatusCode::NOT_FOUND).header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*").body(Body::empty()).unwrap(),
    }
}

/// Binds 127.0.0.1:0 and serves `GET /body/{id}`; returns the port.
pub async fn start(store: Arc<BodyStore>) -> std::io::Result<u16> {
    let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).await?;
    let port = listener.local_addr()?.port();
    let app = Router::new().route("/body/{id}", get(serve_body)).with_state(BridgeState { store });
    tokio::spawn(async move {
        if let Err(err) = axum::serve(listener, app).await {
            log::error!("bridge server stopped: {err}");
        }
    });
    Ok(port)
}
