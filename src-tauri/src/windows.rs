//! Window factory: main window, hidden upload/download worker windows, preview (PageImage)
//! windows and the login / share-site browser windows.

use std::path::PathBuf;

use serde_json::json;
use tauri::window::Color;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

use crate::paths;
use crate::state::{AppState, PageContext};

pub const APP_UA: &str = "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) aDrive/4.12.0 Chrome/108.0.5359.215 Electron/22.3.24 Safari/537.36";
pub const BROWSER_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0";

pub const MAIN: &str = "main";
pub const LOGIN: &str = "login";
pub const SITE: &str = "site";

fn background(theme: &str) -> Color {
    if theme == "dark" {
        Color(0x23, 0x23, 0x2e, 0xff)
    } else {
        Color(0xff, 0xff, 0xff, 0xff)
    }
}

fn app_window(app: &AppHandle, label: &str, hash: &str, width: f64, height: f64, center: bool, theme: &str, visible: bool) -> tauri::Result<WebviewWindow> {
    let url = WebviewUrl::App(PathBuf::from(format!("index.html#{hash}")));
    let mut builder = WebviewWindowBuilder::new(app, label, url)
        .title("神行云盘助手")
        .inner_size(width, height)
        .min_inner_size(width.min(680.0), height.min(500.0))
        .decorations(false)
        .visible(visible)
        .shadow(width > 680.0)
        .background_color(background(theme))
        .user_agent(APP_UA);
    if center {
        builder = builder.center();
    }
    builder.build()
}

pub fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(MAIN)
}

pub fn show_main(app: &AppHandle) {
    if let Some(win) = main_window(app) {
        if win.is_minimized().unwrap_or(false) {
            let _ = win.unminimize();
        }
        let _ = win.show();
        let _ = win.set_focus();
    } else if let Err(err) = create_main_window(app, true) {
        log::error!("create main window: {err}");
    }
}

fn default_size(app: &AppHandle) -> (f64, f64) {
    let mut width = 990.0;
    let mut height = 680.0;
    if let Ok(Some(monitor)) = app.primary_monitor() {
        let scale = monitor.scale_factor();
        let size = monitor.size();
        let w = size.width as f64 / scale * 0.677;
        let h = size.height as f64 / scale * 0.866;
        width = w.min(990.0).max(680.0);
        height = h.min(680.0).max(500.0);
    }
    (width, height)
}

pub fn create_main_window(app: &AppHandle, show: bool) -> tauri::Result<WebviewWindow> {
    let state = app.state::<AppState>();
    let user_data = state.user_data.clone();
    let (width, height) = paths::read_window_size(&user_data).unwrap_or_else(|| default_size(app));
    let theme = paths::read_theme(&user_data);
    let win = app_window(app, MAIN, "page=PageMain", width, height, true, &theme, false)?;
    if paths::setting_bool(&user_data, "uiLaunchMaximized") {
        let _ = win.maximize();
    }
    if show {
        let _ = win.show();
        let _ = win.set_focus();
    }
    let handle = app.clone();
    win.on_window_event(move |event| match event {
        WindowEvent::CloseRequested { api, .. } => {
            if cfg!(target_os = "macos") {
                // the main window closing ends the app (Electron: mainWindow 'closed' -> app.quit())
                handle.exit(0);
            } else {
                api.prevent_close();
                if let Some(win) = main_window(&handle) {
                    let _ = win.hide();
                }
            }
        }
        WindowEvent::Resized(_) => schedule_size_save(&handle),
        WindowEvent::ThemeChanged(theme) => {
            let dark = matches!(theme, tauri::Theme::Dark);
            let _ = handle.emit("setTheme", json!({ "dark": dark }));
        }
        _ => {}
    });
    Ok(win)
}

fn schedule_size_save(app: &AppHandle) {
    let state = app.state::<AppState>();
    let now = std::time::Instant::now();
    *state.last_resize.lock() = now;
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;
        let state = handle.state::<AppState>();
        if *state.last_resize.lock() != now {
            return;
        }
        let Some(win) = main_window(&handle) else { return };
        if win.is_maximized().unwrap_or(false) || win.is_minimized().unwrap_or(false) || win.is_fullscreen().unwrap_or(false) {
            return;
        }
        if let (Ok(size), Ok(scale)) = (win.inner_size(), win.scale_factor()) {
            let w = size.width as f64 / scale;
            let h = size.height as f64 / scale;
            if w > 0.0 && h > 0.0 {
                paths::write_window_size(&state.user_data, w, h);
            }
        }
    });
}

/// `WebOpenWindow({ page: 'PageImage', data, theme })`
pub fn open_page_window(app: &AppHandle, page: String, data: serde_json::Value, theme: String) -> tauri::Result<()> {
    let state = app.state::<AppState>();
    let label = format!("preview-{}", state.next_id().replace('-', ""));
    let (main_w, main_h) = main_window(app)
        .and_then(|w| Some((w.inner_size().ok()?, w.scale_factor().ok()?)))
        .map(|(s, scale)| (s.width as f64 / scale, s.height as f64 / scale))
        .unwrap_or_else(|| default_size(app));
    let width = main_w.max(1080.0);
    let dark = main_window(app).and_then(|w| w.theme().ok()).map(|t| matches!(t, tauri::Theme::Dark)).unwrap_or(false);
    state.page_contexts.lock().insert(label.clone(), PageContext { page: page.clone(), data, theme: theme.clone(), dark, window_type: "preview".into() });
    let win = app_window(app, &label, &format!("page={page}&label={label}"), width, main_h, true, &theme, true)?;
    let _ = win.set_title("预览窗口");
    let handle = app.clone();
    let label_for_event = label.clone();
    win.on_window_event(move |event| {
        if let WindowEvent::Destroyed = event {
            handle.state::<AppState>().page_contexts.lock().remove(&label_for_event);
        }
    });
    Ok(())
}

/// Hidden renderer windows that run the upload / download work loops (formerly BrowserWindows
/// linked to the main window with MessagePorts; now Tauri events).
pub fn ensure_transfer_worker(app: &AppHandle, kind: &str) -> tauri::Result<()> {
    if kind != "upload" && kind != "download" {
        return Ok(());
    }
    if app.get_webview_window(kind).is_some() {
        return Ok(());
    }
    let _ = app.emit_to(MAIN, "worker-reset", json!({ "kind": kind }));
    let win = app_window(app, kind, &format!("page=PageWorker&type={kind}"), 10.0, 10.0, false, "dark", false)?;
    let _ = win.set_title(if kind == "upload" { "神行云盘助手上传进程" } else { "神行云盘助手下载进程" });
    let handle = app.clone();
    let kind_owned = kind.to_string();
    win.on_window_event(move |event| {
        if let WindowEvent::Destroyed = event {
            let _ = handle.emit_to(MAIN, "worker-reset", json!({ "kind": kind_owned }));
        }
    });
    Ok(())
}

fn browser_data_dir(app: &AppHandle, label: &str) -> PathBuf {
    app.state::<AppState>().user_data.join(format!("{label}-webview"))
}

fn is_login_callback(url: &url::Url) -> bool {
    url.path().contains("sign/callback") && url.query_pairs().any(|(k, _)| k == "code")
}

fn browser_window(app: &AppHandle, label: &'static str, url: &str, title: &str, size: (f64, f64), nav_event: &'static str, closed_event: &'static str, block_login_callback: bool) -> tauri::Result<WebviewWindow> {
    let parsed = url::Url::parse(url).map_err(tauri::Error::InvalidUrl)?;
    let handle = app.clone();
    #[allow(unused_mut)]
    let mut builder = WebviewWindowBuilder::new(app, label, WebviewUrl::External(parsed))
        .title(title)
        .inner_size(size.0, size.1)
        .center()
        .user_agent(BROWSER_UA)
        .on_navigation(move |u| {
            let text = u.to_string();
            let _ = handle.emit_to(MAIN, nav_event, json!({ "url": text }));
            if block_login_callback && is_login_callback(u) {
                return false;
            }
            true
        });
    #[cfg(any(windows, target_os = "linux"))]
    {
        builder = builder.data_directory(browser_data_dir(app, label));
    }
    let win = builder.build()?;
    let handle = app.clone();
    win.on_window_event(move |event| {
        if let WindowEvent::Destroyed = event {
            let _ = handle.emit_to(MAIN, closed_event, json!({}));
        }
    });
    Ok(win)
}

/// The login window is reused for the whole session: destroying it would fire `login-closed`
/// at the renderer, so a "clean" login clears its isolated browsing data and re-navigates instead.
pub fn open_login_window(app: &AppHandle, url: &str, clear_data: bool) -> tauri::Result<()> {
    if let Some(win) = app.get_webview_window(LOGIN) {
        if clear_data {
            let _ = win.clear_all_browsing_data();
        }
        let _ = win.eval(&format!("window.location.replace({})", serde_json::to_string(url).unwrap_or_default()));
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }
    if clear_data {
        let _ = std::fs::remove_dir_all(browser_data_dir(app, LOGIN));
    }
    browser_window(app, LOGIN, url, "阿里云盘登录", (560.0, 680.0), "login-navigation", "login-closed", true)?;
    Ok(())
}

/// Hidden (not destroyed) after a successful login so its cookies can still be read by `get_cookies`.
pub fn close_login_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(LOGIN) {
        let _ = win.hide();
    }
}

/// `session.clearStorageData({ origin })` equivalent for the isolated login / site browsing contexts.
pub fn reset_browser_window(app: &AppHandle, label: &str) {
    match app.get_webview_window(label) {
        Some(win) => {
            let _ = win.clear_all_browsing_data();
            if label == LOGIN {
                let _ = win.hide();
                let _ = win.eval("window.location.replace('about:blank')");
            }
        }
        None => {
            let _ = std::fs::remove_dir_all(browser_data_dir(app, label));
        }
    }
}

pub fn open_site_window(app: &AppHandle, url: &str) -> tauri::Result<()> {
    if let Some(win) = app.get_webview_window(SITE) {
        let _ = win.show();
        let _ = win.set_focus();
        let _ = win.eval(&format!("window.location.href = {}", serde_json::to_string(url).unwrap_or_default()));
        return Ok(());
    }
    let (w, h) = default_size(app);
    browser_window(app, SITE, url, "分享网站", (w.max(1080.0), h), "site-navigation", "site-closed", false)?;
    Ok(())
}

pub fn site_window_cmd(app: &AppHandle, cmd: &str) -> Result<(), String> {
    let win = app.get_webview_window(SITE).ok_or_else(|| "missing".to_string())?;
    let js = match cmd {
        "back" => "history.back()",
        "forward" => "history.forward()",
        "reload" => "location.reload()",
        "clear-cookies" => {
            let _ = win.clear_all_browsing_data();
            "location.reload()"
        }
        _ => return Err("unknown".into()),
    };
    win.eval(js).map_err(|e| e.to_string())
}
