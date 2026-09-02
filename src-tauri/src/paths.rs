//! User data directory resolution (mirrors Electron's `userData`, including the `userdir.config`
//! override).

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

pub fn resource_dir(app: &AppHandle) -> PathBuf {
    app.path().resource_dir().unwrap_or_else(|_| std::env::current_dir().unwrap_or_default())
}

pub fn resolve_user_data_dir(app: &AppHandle) -> PathBuf {
    // Electron allowed relocating userData through `<resources>/userdir.config`.
    let override_file = resource_dir(app).join("userdir.config");
    if let Ok(content) = std::fs::read_to_string(&override_file) {
        let custom = content.trim();
        if !custom.is_empty() {
            let dir = PathBuf::from(custom);
            if std::fs::create_dir_all(&dir).is_ok() {
                return dir;
            }
        }
    }
    // Without a config directory every setting, account and task list would be lost on each
    // launch, so there is nothing sensible to fall back to.
    let dir = app.path().app_config_dir().unwrap_or_else(|err| {
        log::error!("no app config directory: {err}");
        panic!("cannot resolve the user data directory: {err}");
    });
    let _ = std::fs::create_dir_all(&dir);
    dir
}

pub fn read_json(path: &Path) -> Option<serde_json::Value> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

pub fn read_theme(user_data: &Path) -> String {
    read_json(&user_data.join("theme.json")).and_then(|v| v.get("theme").and_then(|t| t.as_str()).map(|s| s.to_string())).unwrap_or_default()
}

pub fn write_theme(user_data: &Path, theme: &str) {
    let _ = std::fs::write(user_data.join("theme.json"), format!("{{\"theme\":\"{theme}\"}}"));
}

/// Main-window geometry remembered across launches (`config.json`). `width`/`height` are logical
/// pixels (as the Electron build wrote them); `position` is physical, so it can be handed straight
/// back to the window manager without guessing which monitor's scale factor applied.
#[derive(Debug, Clone, Copy)]
pub struct WindowState {
    pub width: f64,
    pub height: f64,
    pub position: Option<(i32, i32)>,
    pub maximized: bool
}

pub fn read_window_state(user_data: &Path) -> Option<WindowState> {
    let v = read_json(&user_data.join("config.json"))?;
    let width = v.get("width")?.as_f64()?;
    let height = v.get("height")?.as_f64()?;
    if width <= 0.0 || height <= 0.0 {
        return None;
    }
    let x = v.get("x").and_then(|n| n.as_i64());
    let y = v.get("y").and_then(|n| n.as_i64());
    let position = match (x, y) {
        (Some(x), Some(y)) => Some((x as i32, y as i32)),
        _ => None
    };
    Some(WindowState { width, height, position, maximized: v.get("maximized").and_then(|b| b.as_bool()).unwrap_or(false) })
}

pub fn write_window_state(user_data: &Path, state: &WindowState) {
    let mut value = serde_json::json!({
        "width": state.width.round() as i64,
        "height": state.height.round() as i64,
        "maximized": state.maximized
    });
    if let Some((x, y)) = state.position {
        value["x"] = serde_json::json!(x);
        value["y"] = serde_json::json!(y);
    }
    let _ = std::fs::write(user_data.join("config.json"), value.to_string());
}

pub fn read_setting(user_data: &Path) -> Option<serde_json::Value> {
    read_json(&user_data.join("setting.config"))
}

pub fn setting_bool(user_data: &Path, key: &str) -> bool {
    read_setting(user_data).and_then(|v| v.get(key).and_then(|b| b.as_bool())).unwrap_or(false)
}
