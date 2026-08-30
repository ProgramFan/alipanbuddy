//! Background auto update on top of tauri-plugin-updater, keeping the state machine the renderer
//! already understands (`AutoUpdate:StateChanged` events, `AutoUpdateGetState/Check/Install`).

use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

use crate::paths;
use crate::state::AppState;

const GITHUB_UPDATE_FEED_URL: &str = "https://github.com/gaozhangmin/boxplayer/releases/latest/download/latest.json";
const EVENT: &str = "AutoUpdate:StateChanged";

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AutoUpdateState {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub percent: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transferred: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<u64>,
}

impl AutoUpdateState {
    fn status(status: &str) -> Self {
        AutoUpdateState { status: status.to_string(), ..Default::default() }
    }
}

#[derive(Default)]
pub struct AutoUpdate {
    state: Mutex<AutoUpdateState>,
    downloaded: Mutex<Option<Vec<u8>>>,
    checked: Mutex<bool>,
    prompted: Mutex<bool>,
}

impl AutoUpdate {
    pub fn get_state(&self) -> AutoUpdateState {
        self.state.lock().clone()
    }

    fn set_state(&self, app: &AppHandle, state: AutoUpdateState) {
        *self.state.lock() = state.clone();
        let _ = app.emit(EVENT, state);
    }

    pub fn init(&self, app: &AppHandle) {
        let unsupported = cfg!(debug_assertions) || app.config().plugins.0.get("updater").and_then(|u| u.get("pubkey")).and_then(|k| k.as_str()).map(|k| k.is_empty()).unwrap_or(true);
        *self.state.lock() = AutoUpdateState::status(if unsupported { "unsupported" } else { "idle" });
    }

    fn feeds(&self, app: &AppHandle) -> Vec<String> {
        let user_data = app.state::<AppState>().user_data.clone();
        let mut feeds = Vec::new();
        if paths::setting_bool(&user_data, "uiUpdateProxyEnable") {
            let proxy = paths::setting_string(&user_data, "uiUpdateProxyUrl");
            if let Ok(url) = url::Url::parse(proxy.trim()) {
                if url.scheme() == "http" || url.scheme() == "https" {
                    feeds.push(format!("{}/{}", url.to_string().trim_end_matches('/'), GITHUB_UPDATE_FEED_URL));
                }
            }
        }
        feeds.push(GITHUB_UPDATE_FEED_URL.to_string());
        feeds
    }

    /// `AutoUpdate:Check` - checks once unless forced; downloads in the background when an update exists.
    pub async fn check(&self, app: &AppHandle, force: bool) -> AutoUpdateState {
        let current = self.get_state();
        if current.status == "unsupported" || current.status == "checking" || current.status == "downloading" || current.status == "downloaded" {
            return current;
        }
        if *self.checked.lock() && !force {
            return current;
        }
        *self.checked.lock() = true;
        self.set_state(app, AutoUpdateState::status("checking"));
        let mut last_error = String::new();
        for feed in self.feeds(app) {
            match self.check_feed(app, &feed).await {
                Ok(()) => return self.get_state(),
                Err(err) => {
                    log::warn!("[auto-update] {feed}: {err}");
                    last_error = err;
                }
            }
        }
        self.set_state(app, AutoUpdateState { status: "error".into(), message: Some(last_error), ..Default::default() });
        self.get_state()
    }

    async fn check_feed(&self, app: &AppHandle, feed: &str) -> Result<(), String> {
        let endpoint = url::Url::parse(feed).map_err(|e| e.to_string())?;
        let updater = app.updater_builder().endpoints(vec![endpoint]).map_err(|e| e.to_string())?.build().map_err(|e| e.to_string())?;
        let update = updater.check().await.map_err(|e| e.to_string())?;
        let Some(update) = update else {
            self.set_state(app, AutoUpdateState { status: "up-to-date".into(), version: Some(app.package_info().version.to_string()), ..Default::default() });
            return Ok(());
        };
        let version = update.version.clone();
        self.set_state(app, AutoUpdateState { status: "downloading".into(), version: Some(version.clone()), percent: Some(0.0), ..Default::default() });
        let this: &'static AutoUpdate = unsafe { &*(self as *const AutoUpdate) };
        let app_for_progress = app.clone();
        let version_for_progress = version.clone();
        let transferred = std::sync::Arc::new(std::sync::atomic::AtomicU64::new(0));
        let transferred_cb = transferred.clone();
        let bytes = update
            .download(
                move |chunk, total| {
                    let done = transferred_cb.fetch_add(chunk as u64, std::sync::atomic::Ordering::Relaxed) + chunk as u64;
                    let percent = total.map(|t| if t > 0 { (done as f64 / t as f64 * 100.0).min(100.0) } else { 0.0 });
                    this.set_state(&app_for_progress, AutoUpdateState { status: "downloading".into(), version: Some(version_for_progress.clone()), percent, transferred: Some(done), total, ..Default::default() });
                },
                || {},
            )
            .await
            .map_err(|e| e.to_string())?;
        *self.downloaded.lock() = Some(bytes);
        self.set_state(app, AutoUpdateState { status: "downloaded".into(), version: Some(version.clone()), percent: Some(100.0), ..Default::default() });
        self.prompt_restart(app, &version);
        Ok(())
    }

    fn prompt_restart(&self, app: &AppHandle, version: &str) {
        if *self.prompted.lock() {
            return;
        }
        *self.prompted.lock() = true;
        let handle = app.clone();
        let version = version.to_string();
        app.dialog()
            .message(format!("新版本 {version} 已在后台下载完成\n重启 App 即可完成更新安装。"))
            .title("更新已下载")
            .kind(MessageDialogKind::Info)
            .buttons(MessageDialogButtons::OkCancelCustom("重启安装".into(), "稍后".into()))
            .show(move |restart| {
                if restart {
                    handle.state::<AppState>().update.install(&handle);
                }
            });
    }

    /// `AutoUpdate:Install` - installs the downloaded package and restarts.
    pub fn install(&self, app: &AppHandle) -> bool {
        let Some(bytes) = self.downloaded.lock().take() else { return false };
        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            let result: Result<(), String> = async {
                let updater = handle.updater_builder().build().map_err(|e| e.to_string())?;
                // re-check to obtain an `Update` handle for install(); the bytes were already verified when downloaded
                match updater.check().await.map_err(|e| e.to_string())? {
                    Some(update) => update.install(bytes).map_err(|e| e.to_string()),
                    None => Err("no update available".into()),
                }
            }
            .await;
            match result {
                Ok(()) => handle.restart(),
                Err(err) => {
                    log::warn!("[auto-update] install failed: {err}");
                    handle.state::<AppState>().update.set_state(&handle, AutoUpdateState { status: "error".into(), message: Some(err), ..Default::default() });
                }
            }
        });
        true
    }
}
