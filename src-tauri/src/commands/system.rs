use std::process::Command;

use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::menu::{Menu, PredefinedMenuItem};
use tauri::window::{ProgressBarState, ProgressBarStatus};
use tauri::{AppHandle, Emitter, Manager, Window};
use tauri_plugin_autostart::ManagerExt as AutostartExt;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;

use crate::commands::proxy;
use crate::paths;
use crate::state::{AppState, KeepAwakeHandle};
use crate::update::AutoUpdateState;
use crate::windows;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformInfo {
    platform: &'static str,
    arch: &'static str,
    version: String,
    app_version: String,
    exec_path: String,
    app_path: String,
    resource_path: String,
    argv0: String,
    argv: Vec<String>,
    window_label: String,
    setting_json: String,
}

fn node_platform() -> &'static str {
    if cfg!(target_os = "windows") {
        "win32"
    } else if cfg!(target_os = "macos") {
        "darwin"
    } else {
        "linux"
    }
}

fn node_arch() -> &'static str {
    match std::env::consts::ARCH {
        "x86_64" => "x64",
        "x86" => "ia32",
        "aarch64" => "arm64",
        "arm" => "arm",
        other => other,
    }
}

#[tauri::command]
pub fn platform_info(app: AppHandle, window: Window) -> PlatformInfo {
    let state = app.state::<AppState>();
    let argv: Vec<String> = std::env::args().collect();
    PlatformInfo {
        platform: node_platform(),
        arch: node_arch(),
        version: tauri::VERSION.to_string(),
        app_version: app.package_info().version.to_string(),
        exec_path: std::env::current_exe().map(|p| p.display().to_string()).unwrap_or_default(),
        app_path: state.user_data.display().to_string(),
        resource_path: state.resource_dir.display().to_string(),
        argv0: argv.first().cloned().unwrap_or_default(),
        argv,
        window_label: window.label().to_string(),
        setting_json: std::fs::read_to_string(state.user_file("setting.config")).unwrap_or_default(),
    }
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DialogFilter {
    name: String,
    extensions: Vec<String>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct OpenDialogOptions {
    title: Option<String>,
    #[serde(rename = "buttonLabel")]
    button_label: Option<String>,
    #[serde(rename = "defaultPath")]
    default_path: Option<String>,
    filters: Option<Vec<DialogFilter>>,
    properties: Option<Vec<String>>,
}

/// `dialog.showOpenDialogSync` replacement.
#[tauri::command]
pub async fn open_dialog(app: AppHandle, options: OpenDialogOptions) -> Result<Vec<String>, String> {
    let props = options.properties.unwrap_or_default();
    let directory = props.iter().any(|p| p == "openDirectory");
    let multi = props.iter().any(|p| p == "multiSelections");
    tauri::async_runtime::spawn_blocking(move || {
        let mut dialog = app.dialog().file();
        if let Some(title) = options.title {
            dialog = dialog.set_title(title);
        }
        if let Some(path) = options.default_path.filter(|p| !p.is_empty()) {
            let p = std::path::PathBuf::from(path);
            if p.is_dir() {
                dialog = dialog.set_directory(p);
            } else if let Some(parent) = p.parent() {
                dialog = dialog.set_directory(parent);
            }
        }
        for filter in options.filters.unwrap_or_default() {
            let exts: Vec<&str> = filter.extensions.iter().map(|s| s.as_str()).collect();
            dialog = dialog.add_filter(filter.name, &exts);
        }
        let paths = if directory {
            if multi {
                dialog.blocking_pick_folders().unwrap_or_default()
            } else {
                dialog.blocking_pick_folder().map(|p| vec![p]).unwrap_or_default()
            }
        } else if multi {
            dialog.blocking_pick_files().unwrap_or_default()
        } else {
            dialog.blocking_pick_file().map(|p| vec![p]).unwrap_or_default()
        };
        Ok(paths.into_iter().filter_map(|p| p.into_path().ok()).map(|p| p.display().to_string()).collect())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn clipboard_read_text(app: AppHandle) -> Result<String, String> {
    app.clipboard().read_text().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clipboard_write_text(app: AppHandle, text: String) -> Result<(), String> {
    app.clipboard().write_text(text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    if url.is_empty() {
        return Ok(());
    }
    if url.starts_with("http://") || url.starts_with("https://") || url.starts_with("mailto:") {
        app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
    } else {
        app.opener().open_path(url, None::<&str>).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn open_path(app: AppHandle, path: String) -> Result<(), String> {
    app.opener().open_path(path, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn show_item_in_folder(app: AppHandle, path: String) -> Result<(), String> {
    app.opener().reveal_item_in_dir(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn shutdown_computer(app: AppHandle, sudo: Option<bool>, quit_app: Option<bool>) {
    let result = if cfg!(target_os = "macos") {
        Command::new("osascript").args(["-e", "tell application \"System Events\" to shut down"]).spawn()
    } else if cfg!(target_os = "windows") {
        Command::new("shutdown").args(["-s", "-f", "-t", "0"]).spawn()
    } else if sudo.unwrap_or(false) {
        Command::new("sudo").args(["shutdown", "-h", "now"]).spawn()
    } else {
        Command::new("shutdown").args(["-h", "now"]).spawn()
    };
    if let Err(err) = result {
        log::warn!("shutdown failed: {err}");
    }
    if quit_app.unwrap_or(false) {
        app.exit(0);
    }
}

#[tauri::command]
pub fn prevent_sleep(app: AppHandle, flag: bool) {
    let state = app.state::<AppState>();
    let mut guard = state.keep_awake.lock();
    if flag {
        if guard.0.is_some() {
            return;
        }
        match keepawake::Builder::default().display(false).idle(true).sleep(true).reason("Transferring files").app_name("AlipanBuddy").app_reverse_domain("com.alipanbuddy.app").create() {
            Ok(handle) => *guard = KeepAwakeHandle(Some(handle)),
            Err(err) => log::warn!("keepawake: {err}"),
        }
    } else {
        *guard = KeepAwakeHandle(None);
    }
}

#[tauri::command]
pub fn set_progress_bar(app: AppHandle, progress: f64, mode: Option<String>) {
    let Some(win) = windows::main_window(&app) else { return };
    let state = if progress < 0.0 || mode.as_deref() == Some("none") {
        ProgressBarState { status: Some(ProgressBarStatus::None), progress: None }
    } else {
        let status = match mode.as_deref() {
            Some("paused") => ProgressBarStatus::Paused,
            Some("error") => ProgressBarStatus::Error,
            Some("indeterminate") => ProgressBarStatus::Indeterminate,
            _ => ProgressBarStatus::Normal,
        };
        let value = if progress <= 1.0 { progress * 100.0 } else { progress };
        ProgressBarState { status: Some(status), progress: Some(value.clamp(0.0, 100.0) as u64) }
    };
    let _ = win.set_progress_bar(state);
}

#[tauri::command]
pub fn notify_download_completed(app: AppHandle, file_name: Option<String>) {
    let body = match file_name.filter(|n| !n.is_empty()) {
        Some(name) => format!("{name} 已下载完成"),
        None => "文件下载完成".to_string(),
    };
    if let Err(err) = app.notification().builder().title("下载完成").body(body).show() {
        log::warn!("notification: {err}");
    }
}

#[tauri::command]
pub fn show_context_menu(app: AppHandle, window: Window, show_copy: Option<bool>, show_cut: Option<bool>, show_paste: Option<bool>) -> Result<(), String> {
    let mut items: Vec<Box<dyn tauri::menu::IsMenuItem<tauri::Wry>>> = Vec::new();
    items.push(Box::new(PredefinedMenuItem::select_all(&app, Some("全选")).map_err(|e| e.to_string())?));
    if show_copy.unwrap_or(false) {
        items.push(Box::new(PredefinedMenuItem::copy(&app, Some("复制")).map_err(|e| e.to_string())?));
    }
    if show_cut.unwrap_or(false) {
        items.push(Box::new(PredefinedMenuItem::cut(&app, Some("剪切")).map_err(|e| e.to_string())?));
    }
    if show_paste.unwrap_or(false) {
        items.push(Box::new(PredefinedMenuItem::paste(&app, Some("粘贴")).map_err(|e| e.to_string())?));
    }
    items.push(Box::new(PredefinedMenuItem::undo(&app, Some("撤销")).map_err(|e| e.to_string())?));
    let refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = items.iter().map(|i| i.as_ref()).collect();
    let menu = Menu::with_items(&app, &refs).map_err(|e| e.to_string())?;
    window.popup_menu(&menu).map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct CookieInfo {
    name: String,
    value: String,
    domain: String,
    path: String,
}

/// Cookies of the (hidden) login window - the only webview that talked to aliyundrive.com.
#[tauri::command]
pub fn get_cookies(app: AppHandle, url: String) -> Vec<CookieInfo> {
    let Ok(parsed) = url::Url::parse(&url) else { return vec![] };
    let mut out = Vec::new();
    for label in [windows::LOGIN, windows::MAIN] {
        if let Some(win) = app.get_webview_window(label) {
            if let Ok(cookies) = win.cookies_for_url(parsed.clone()) {
                for c in cookies {
                    out.push(CookieInfo { name: c.name().to_string(), value: c.value().to_string(), domain: c.domain().unwrap_or("").to_string(), path: c.path().unwrap_or("").to_string() });
                }
            }
        }
        if !out.is_empty() {
            break;
        }
    }
    out
}

/// `session.clearStorageData({ origin })` - the login / site windows have isolated cookie stores.
#[tauri::command]
pub fn clear_cookies(app: AppHandle, origin: String) {
    if origin.contains("aliyundrive") || origin.contains("alipan") || origin.is_empty() {
        windows::reset_browser_window(&app, windows::LOGIN);
    } else {
        windows::reset_browser_window(&app, windows::SITE);
    }
}

/// `session.clearCache()/clearStorageData()` for the main webview. `all` also wipes IndexedDB / localStorage.
#[tauri::command]
pub fn clear_browsing_data(app: AppHandle, all: Option<bool>) {
    if all.unwrap_or(false) {
        if let Some(win) = windows::main_window(&app) {
            let _ = win.clear_all_browsing_data();
        }
    }
    windows::reset_browser_window(&app, windows::LOGIN);
    windows::reset_browser_window(&app, windows::SITE);
}

fn proxy_cmd_client(url: &str, follow: bool) -> reqwest::Client {
    crate::commands::http::build_client(url, follow)
}

#[tauri::command]
pub async fn set_proxy(app: AppHandle, proxy_url: Option<String>) -> Result<(), String> {
    let url = proxy_url.unwrap_or_default();
    let state = app.state::<AppState>();
    let changed = *state.http_proxy.lock() != url;
    *state.http_proxy.lock() = url.clone();
    *state.upload_client.lock() = boxcore::upload::build_client(Some(url.as_str()).filter(|u| !u.is_empty()));
    *state.http_clients.lock() = (proxy_cmd_client(&url, true), proxy_cmd_client(&url, false));
    if changed {
        let port = *state.proxy_port.lock();
        if port > 0 {
            proxy::start_server(&app, port).await?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn relaunch_app(app: AppHandle) {
    app.restart();
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub fn save_theme(app: AppHandle, theme: String) {
    let state = app.state::<AppState>();
    paths::write_theme(&state.user_data, &theme);
    let dark = windows::main_window(&app).and_then(|w| w.theme().ok()).map(|t| matches!(t, tauri::Theme::Dark)).unwrap_or(false);
    let _ = app.emit("setTheme", json!({ "theme": if theme.is_empty() { "system".to_string() } else { theme }, "dark": dark }));
}

#[derive(Serialize)]
pub struct ThemeState {
    theme: String,
    dark: bool,
}

#[tauri::command]
pub fn get_theme_state(app: AppHandle, window: Window) -> ThemeState {
    let state = app.state::<AppState>();
    let dark = window.theme().map(|t| matches!(t, tauri::Theme::Dark)).unwrap_or(false);
    ThemeState { theme: paths::read_theme(&state.user_data), dark }
}

#[tauri::command]
pub fn set_launch_at_login(app: AppHandle, enable: bool, show: Option<bool>) -> Result<(), String> {
    let _ = show; // visibility at autostart is decided from setting.config (uiLaunchStartShow)
    let manager = app.autolaunch();
    if enable {
        manager.enable().map_err(|e| e.to_string())
    } else {
        manager.disable().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn aria_rpc_port(app: AppHandle) -> Result<u16, String> {
    crate::aria::ensure_running(&app)
}

#[tauri::command]
pub fn aria_restart(app: AppHandle) -> Result<u16, String> {
    crate::aria::restart(&app)
}

#[tauri::command]
pub fn auto_update_get_state(app: AppHandle) -> AutoUpdateState {
    app.state::<AppState>().update.get_state()
}

#[tauri::command]
pub async fn auto_update_check(app: AppHandle, force: Option<bool>) -> AutoUpdateState {
    let handle = app.clone();
    let state = handle.state::<AppState>();
    state.update.check(&app, force.unwrap_or(false)).await
}

#[tauri::command]
pub fn auto_update_install(app: AppHandle) -> bool {
    app.state::<AppState>().update.install(&app)
}
