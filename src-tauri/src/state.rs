use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use boxcore::proxy::ProxyServer;
use boxcore::speed::SpeedLimiter;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tokio::sync::oneshot;

use crate::aria::AriaEngine;
use crate::update::AutoUpdate;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PageContext {
    pub page: String,
    pub data: serde_json::Value,
    pub theme: String,
    pub dark: bool,
    pub window_type: String,
}

pub struct KeepAwakeHandle(pub Option<keepawake::KeepAwake>);
// keepawake handles are only ever touched behind the mutex below.
unsafe impl Send for KeepAwakeHandle {}

pub struct AppState {
    /// Electron's `userData` equivalent (setting.config, download.session, ... live here).
    pub user_data: PathBuf,
    pub resource_dir: PathBuf,
    pub aria: Mutex<Option<AriaEngine>>,
    pub proxy: tokio::sync::Mutex<Option<ProxyServer>>,
    pub proxy_port: Mutex<u16>,
    pub pending_urls: Mutex<HashMap<String, oneshot::Sender<String>>>,
    pub next_id: Mutex<u64>,
    pub page_contexts: Mutex<HashMap<String, PageContext>>,
    pub upload_client: Mutex<reqwest::Client>,
    /// (redirect-following client, manual-redirect client) used by the `http_request` command
    pub http_clients: Mutex<(reqwest::Client, reqwest::Client)>,
    pub upload_limiter: Arc<SpeedLimiter>,
    pub upload_cancels: Mutex<HashMap<u64, Arc<AtomicBool>>>,
    pub sha1_cancels: Mutex<HashMap<u64, Arc<AtomicBool>>>,
    pub keep_awake: Mutex<KeepAwakeHandle>,
    pub http_proxy: Mutex<String>,
    pub always_on_top: Mutex<HashMap<String, bool>>,
    pub update: AutoUpdate,
    pub last_resize: Mutex<std::time::Instant>,
    pub rpc_client: reqwest::Client,
    /// loopback body server (crate::bridge)
    pub bridge_port: Mutex<u16>,
    pub body_store: Arc<crate::bridge::BodyStore>,
}

impl AppState {
    pub fn new(user_data: PathBuf, resource_dir: PathBuf) -> Self {
        AppState {
            user_data,
            resource_dir,
            aria: Mutex::new(None),
            proxy: tokio::sync::Mutex::new(None),
            proxy_port: Mutex::new(0),
            pending_urls: Mutex::new(HashMap::new()),
            next_id: Mutex::new(1),
            page_contexts: Mutex::new(HashMap::new()),
            upload_client: Mutex::new(boxcore::upload::build_client(None)),
            http_clients: Mutex::new((crate::commands::http::build_client("", true), crate::commands::http::build_client("", false))),
            upload_limiter: Arc::new(SpeedLimiter::new(0)),
            upload_cancels: Mutex::new(HashMap::new()),
            sha1_cancels: Mutex::new(HashMap::new()),
            keep_awake: Mutex::new(KeepAwakeHandle(None)),
            http_proxy: Mutex::new(String::new()),
            always_on_top: Mutex::new(HashMap::new()),
            update: AutoUpdate::default(),
            last_resize: Mutex::new(std::time::Instant::now()),
            rpc_client: reqwest::Client::builder().no_proxy().timeout(std::time::Duration::from_secs(3)).build().unwrap_or_default(),
            bridge_port: Mutex::new(0),
            body_store: Arc::new(crate::bridge::BodyStore::default()),
        }
    }

    pub fn next_id(&self) -> String {
        let mut id = self.next_id.lock();
        *id += 1;
        format!("{}-{}", std::process::id(), *id)
    }

    pub fn user_file(&self, name: &str) -> PathBuf {
        self.user_data.join(name)
    }
}
