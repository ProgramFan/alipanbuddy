//! Window factory: main window, the hidden upload worker window, preview (PageImage) windows
//! and the login / share-site browser windows.

use std::path::PathBuf;

use serde_json::json;
use tauri::window::Color;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

use crate::paths;
use crate::paths::WindowState;
use crate::state::{AppState, PageContext};

pub const APP_UA: &str = "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) aDrive/4.12.0 Chrome/108.0.5359.215 Electron/22.3.24 Safari/537.36";
pub const BROWSER_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0";

pub const MAIN: &str = "main";
pub const UPLOAD: &str = "upload";
pub const LOGIN: &str = "login";
pub const SITE: &str = "site";

fn background(theme: &str) -> Color {
    if theme == "dark" {
        Color(0x23, 0x23, 0x2e, 0xff)
    } else {
        Color(0xff, 0xff, 0xff, 0xff)
    }
}

/// Where a new window starts out. `Default` leaves it to the window manager (hidden workers).
enum Placement {
    Default,
    Center
}

fn app_window(app: &AppHandle, label: &str, hash: &str, width: f64, height: f64, placement: Placement, theme: &str, visible: bool) -> tauri::Result<WebviewWindow> {
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
    if let Placement::Center = placement {
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

/// A remembered position is only reused while the window's top-left still lands on a connected
/// monitor, so unplugging the screen it was on doesn't park the app out of reach. Enough of the
/// window has to stay inside for its (undecorated) title bar to be grabbable.
fn is_on_screen(app: &AppHandle, (x, y): (i32, i32)) -> bool {
    let Ok(monitors) = app.available_monitors() else { return false };
    monitors.iter().any(|monitor| {
        let origin = monitor.position();
        let size = monitor.size();
        x + 120 >= origin.x && x + 120 <= origin.x + size.width as i32 && y >= origin.y && y + 40 <= origin.y + size.height as i32
    })
}

pub fn create_main_window(app: &AppHandle, show: bool) -> tauri::Result<WebviewWindow> {
    let state = app.state::<AppState>();
    let user_data = state.user_data.clone();
    let saved = paths::read_window_state(&user_data);
    let (width, height) = saved.map(|s| (s.width, s.height)).unwrap_or_else(|| default_size(app));
    let theme = paths::read_theme(&user_data);
    let win = app_window(app, MAIN, "page=PageMain", width, height, Placement::Center, &theme, false)?;
    // The window is still hidden here, so moving it onto its remembered spot costs no visible jump.
    if let Some(position) = saved.and_then(|s| s.position).filter(|p| is_on_screen(app, *p)) {
        let _ = win.set_position(PhysicalPosition::new(position.0, position.1));
    }
    if saved.map(|s| s.maximized).unwrap_or(false) || paths::setting_bool(&user_data, "uiLaunchMaximized") {
        let _ = win.maximize();
    }
    if show {
        let _ = win.show();
        let _ = win.set_focus();
    }
    let handle = app.clone();
    win.on_window_event(move |event| match event {
        WindowEvent::CloseRequested { api, .. } => {
            // Save now rather than waiting out the debounce: the window is about to go away.
            save_window_geometry(&handle);
            // Only the in-app close button used to consult uiExitOnClose, because it routes
            // through the renderer. Every other way of closing the window — Alt+F4, the window
            // manager, a session logout — lands here instead, so the setting has to be honoured
            // in both places or "quit on close" appears to work only some of the time.
            let exit_on_close = {
                let user_data = handle.state::<AppState>().user_data.clone();
                paths::setting_bool(&user_data, "uiExitOnClose")
            };
            if exit_on_close {
                // the main window closing ends the app (Electron: mainWindow 'closed' -> app.quit())
                handle.exit(0);
            } else {
                api.prevent_close();
                if let Some(win) = main_window(&handle) {
                    let _ = win.hide();
                }
            }
        }
        WindowEvent::Resized(_) | WindowEvent::Moved(_) => schedule_geometry_save(&handle),
        WindowEvent::ThemeChanged(theme) => {
            let dark = matches!(theme, tauri::Theme::Dark);
            let _ = handle.emit("setTheme", json!({ "dark": dark }));
        }
        _ => {}
    });
    Ok(win)
}

/// Resize / move events arrive in bursts; only the last one in a burst reaches `config.json`.
fn schedule_geometry_save(app: &AppHandle) {
    let state = app.state::<AppState>();
    let now = std::time::Instant::now();
    *state.last_resize.lock() = now;
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        if *handle.state::<AppState>().last_resize.lock() != now {
            return;
        }
        save_window_geometry(&handle);
    });
}

/// Remembers the main window's size and position. A maximised window keeps whatever restore
/// geometry is already on disk and only records that it was maximised; fullscreen is left alone.
pub fn save_window_geometry(app: &AppHandle) {
    let Some(win) = main_window(app) else { return };
    if win.is_minimized().unwrap_or(false) || win.is_fullscreen().unwrap_or(false) {
        return;
    }
    let user_data = app.state::<AppState>().user_data.clone();
    if win.is_maximized().unwrap_or(false) {
        let mut previous = paths::read_window_state(&user_data).unwrap_or_else(|| {
            let (width, height) = default_size(app);
            WindowState { width, height, position: None, maximized: false }
        });
        if !previous.maximized {
            previous.maximized = true;
            paths::write_window_state(&user_data, &previous);
        }
        return;
    }
    let (Ok(size), Ok(scale)) = (win.inner_size(), win.scale_factor()) else { return };
    let width = size.width as f64 / scale;
    let height = size.height as f64 / scale;
    if width <= 0.0 || height <= 0.0 {
        return;
    }
    let position = win.outer_position().ok().map(|p| (p.x, p.y));
    paths::write_window_state(&user_data, &WindowState { width, height, position, maximized: false });
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
    let win = app_window(app, &label, &format!("page={page}&label={label}"), width, main_h, Placement::Center, &theme, true)?;
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

/// Hidden renderer window that runs the upload work loop (formerly a BrowserWindow linked to the
/// main window with MessagePorts; now Tauri events). Downloads run in the main window.
pub fn ensure_transfer_worker(app: &AppHandle, kind: &str) -> tauri::Result<()> {
    if kind != UPLOAD {
        return Ok(());
    }
    if app.get_webview_window(UPLOAD).is_some() {
        return Ok(());
    }
    let _ = app.emit_to(MAIN, "worker-reset", json!({ "kind": UPLOAD }));
    let win = app_window(app, UPLOAD, "page=PageWorker&type=upload", 10.0, 10.0, Placement::Default, "dark", false)?;
    let _ = win.set_title("神行云盘助手上传进程");
    let handle = app.clone();
    win.on_window_event(move |event| {
        if let WindowEvent::Destroyed = event {
            let _ = handle.emit_to(MAIN, "worker-reset", json!({ "kind": UPLOAD }));
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
    let builder = WebviewWindowBuilder::new(app, label, WebviewUrl::External(parsed))
        .title(title)
        .inner_size(size.0, size.1)
        .center()
        .user_agent(BROWSER_UA)
        .data_directory(browser_data_dir(app, label))
        .on_navigation(move |u| {
            let text = u.to_string();
            let _ = handle.emit_to(MAIN, nav_event, json!({ "url": text }));
            if block_login_callback && is_login_callback(u) {
                return false;
            }
            true
        });
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
