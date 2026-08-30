//! File hashing, part upload and whole-file encryption commands used by the upload worker and
//! the add-on tools.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use base64::Engine;
use alipancore::flowenc::Alg;
use alipancore::upload::{UploadEncryption, UploadPartRequest, UploadPartResult};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager, Window};

use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sha1Result {
    pub sha1: String,
    pub proof_code: String,
}

#[tauri::command]
pub async fn file_prehash(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || alipancore::hashing::prehash(&PathBuf::from(path)).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn file_sha1(window: Window, app: AppHandle, task_id: u64, path: String, access_token: String) -> Result<Sha1Result, String> {
    let cancel = Arc::new(AtomicBool::new(false));
    app.state::<AppState>().sha1_cancels.lock().insert(task_id, cancel.clone());
    let cancel_for_task = cancel.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(path);
        let mut last = Instant::now() - Duration::from_secs(1);
        let hash = alipancore::hashing::sha1_file(&path, &cancel_for_task, |read, size| {
            if last.elapsed() >= Duration::from_millis(300) {
                last = Instant::now();
                let _ = window.emit("sha1-progress", json!({ "taskId": task_id, "readlen": read, "size": size }));
            }
        })
        .map_err(|e| e.to_string())?;
        let Some(sha1) = hash else { return Err("已暂停".to_string()) };
        let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        let proof_code = alipancore::hashing::proof_code(&path, &access_token, size).map_err(|e| e.to_string())?;
        Ok(Sha1Result { sha1, proof_code })
    })
    .await
    .map_err(|e| e.to_string())?;
    app.state::<AppState>().sha1_cancels.lock().remove(&task_id);
    result
}

#[tauri::command]
pub fn file_sha1_cancel(app: AppHandle, task_id: u64) {
    if let Some(flag) = app.state::<AppState>().sha1_cancels.lock().get(&task_id) {
        flag.store(true, Ordering::Relaxed);
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EncryptionArg {
    pub alg: String,
    pub password: String,
    pub file_size: u64,
}

#[tauri::command]
pub async fn upload_part(window: Window, app: AppHandle, task_id: u64, path: String, start: u64, size: u64, url: String, authorization: String, encryption: Option<EncryptionArg>) -> Result<UploadPartResult, String> {
    let encryption = match encryption {
        Some(e) => Some(UploadEncryption { alg: Alg::parse(&e.alg).ok_or_else(|| format!("unsupported encryption type {}", e.alg))?, password: e.password, file_size: e.file_size }),
        None => None,
    };
    let state = app.state::<AppState>();
    let cancel = Arc::new(AtomicBool::new(false));
    state.upload_cancels.lock().insert(task_id, cancel.clone());
    let client = state.upload_client.lock().clone();
    let limiter = state.upload_limiter.clone();
    let progress_window = window.clone();
    let progress: Arc<dyn Fn(u64, u64) + Send + Sync> = Arc::new(move |pos, delta| {
        let _ = progress_window.emit("upload-progress", json!({ "taskId": task_id, "pos": pos, "delta": delta }));
    });
    let result = alipancore::upload::upload_part(&client, UploadPartRequest { path: PathBuf::from(path), start, size, url, authorization, encryption }, cancel, limiter, progress).await;
    app.state::<AppState>().upload_cancels.lock().remove(&task_id);
    result.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn upload_cancel(app: AppHandle, task_id: u64) {
    if let Some(flag) = app.state::<AppState>().upload_cancels.lock().get(&task_id) {
        flag.store(true, Ordering::Relaxed);
    }
}

#[tauri::command]
pub fn set_upload_speed_limit(app: AppHandle, bytes_per_second: u64) {
    app.state::<AppState>().upload_limiter.set_limit(bytes_per_second);
}

#[tauri::command]
pub async fn flowenc_file(alg: String, password: String, src: String, dst: String) -> Result<u64, String> {
    let alg = Alg::parse(&alg).ok_or_else(|| format!("unsupported encryption type {alg}"))?;
    tauri::async_runtime::spawn_blocking(move || alipancore::encfile::transform_file(alg, &password, &PathBuf::from(src), &PathBuf::from(dst)).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn flowenc_bytes(alg: String, password: String, size_salt: u64, base64: String) -> Result<String, String> {
    let alg = Alg::parse(&alg).ok_or_else(|| format!("unsupported encryption type {alg}"))?;
    let mut data = base64::engine::general_purpose::STANDARD.decode(base64).map_err(|e| e.to_string())?;
    alipancore::encfile::transform_bytes(alg, &password, size_salt, &mut data).map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(data))
}
