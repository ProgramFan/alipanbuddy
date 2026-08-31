use tauri::{AppHandle, Manager, Window};

use crate::state::{AppState, PageContext};
use crate::windows;

/// `WebToElectron({ cmd })` for the main window.
#[tauri::command]
pub fn main_window_cmd(app: AppHandle, cmd: String) -> Result<String, String> {
    let win = windows::main_window(&app);
    match cmd.as_str() {
        "close" => {
            if let Some(w) = win {
                let _ = w.hide();
            }
            Ok("close".into())
        }
        "exit" => {
            app.exit(0);
            Ok("exit".into())
        }
        "relaunch" => {
            app.restart();
        }
        "minsize" => {
            if let Some(w) = win {
                let _ = w.minimize();
            }
            Ok("minsize".into())
        }
        "maxsize" => {
            let Some(w) = win else { return Ok("missing".into()) };
            if w.is_maximized().unwrap_or(false) {
                let _ = w.unmaximize();
                Ok("unmaximize".into())
            } else {
                let _ = w.maximize();
                Ok("maximize".into())
            }
        }
        _ => Ok("backdata".into()),
    }
}

/// `WebToWindow({ cmd })` for the calling (preview) window.
#[tauri::command]
pub fn window_cmd(app: AppHandle, window: Window, cmd: String) -> String {
    let label = window.label().to_string();
    match cmd.as_str() {
        "close" => {
            let _ = window.close();
            "close".into()
        }
        "minsize" => {
            let _ = window.minimize();
            "minsize".into()
        }
        "top" => {
            let state = app.state::<AppState>();
            let mut map = state.always_on_top.lock();
            let current = map.get(&label).copied().unwrap_or(false);
            let _ = window.set_always_on_top(!current);
            map.insert(label, !current);
            if current {
                "untop".into()
            } else {
                "top".into()
            }
        }
        "maxsize" => {
            if window.is_maximized().unwrap_or(false) {
                let _ = window.unmaximize();
                "unmaximize".into()
            } else {
                let _ = window.maximize();
                "maximize".into()
            }
        }
        "fullscreen" => {
            let full = window.is_fullscreen().unwrap_or(false);
            let _ = window.set_fullscreen(!full);
            if full {
                "unfullscreen".into()
            } else {
                "fullscreen".into()
            }
        }
        "enterfullscreen" => {
            let _ = window.set_fullscreen(true);
            "fullscreen".into()
        }
        "exitfullscreen" => {
            let _ = window.set_fullscreen(false);
            "unfullscreen".into()
        }
        _ => "unknown".into(),
    }
}

// Window-creating commands are async on purpose: a synchronous command runs on the
// main thread, and building a second webview inside the blocked IPC handler can
// deadlock the GTK main loop on Linux (window appears, whole app freezes).
#[tauri::command]
pub async fn open_page_window(app: AppHandle, page: String, data: serde_json::Value, theme: String) -> Result<(), String> {
    windows::open_page_window(&app, page, data, theme).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_page_context(app: AppHandle, window: Window) -> PageContext {
    let state = app.state::<AppState>();
    let label = window.label().to_string();
    if let Some(ctx) = state.page_contexts.lock().get(&label).cloned() {
        return ctx;
    }
    let dark = window.theme().map(|t| matches!(t, tauri::Theme::Dark)).unwrap_or(false);
    let (page, window_type) = match label.as_str() {
        "upload" | "download" => ("PageWorker", label.as_str()),
        _ => ("PageMain", "main"),
    };
    PageContext { page: page.into(), data: serde_json::Value::Null, theme: String::new(), dark, window_type: window_type.into() }
}

#[tauri::command]
pub async fn ensure_transfer_worker(app: AppHandle, kind: String) -> Result<(), String> {
    windows::ensure_transfer_worker(&app, &kind).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn worker_ready(app: AppHandle, kind: String) {
    use tauri::Emitter;
    let _ = app.emit_to(windows::MAIN, "worker-ready", serde_json::json!({ "kind": kind }));
}

#[tauri::command]
pub async fn open_login_window(app: AppHandle, url: String, referer: Option<String>, clear_data: Option<bool>) -> Result<(), String> {
    let _ = referer;
    windows::open_login_window(&app, &url, clear_data.unwrap_or(false)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn close_login_window(app: AppHandle) {
    windows::close_login_window(&app);
}

#[tauri::command]
pub async fn open_site_window(app: AppHandle, url: String) -> Result<(), String> {
    windows::open_site_window(&app, &url).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn site_window_cmd(app: AppHandle, cmd: String) -> Result<(), String> {
    windows::site_window_cmd(&app, &cmd)
}

#[tauri::command]
pub fn close_site_window(app: AppHandle) {
    if let Some(win) = app.get_webview_window(windows::SITE) {
        let _ = win.close();
    }
}

#[tauri::command]
pub fn toggle_devtools(window: tauri::WebviewWindow) {
    if window.is_devtools_open() {
        window.close_devtools();
    } else {
        window.open_devtools();
    }
}
