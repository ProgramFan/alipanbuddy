use std::path::PathBuf;

use base64::Engine;
use alipancore::fsx::{self, DirEntryInfo, FsError, StatInfo};

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, FsError> + Send + 'static) -> Result<T, FsError> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| FsError::new("EIO", e.to_string()))?
}

#[tauri::command]
pub async fn fs_exists(path: String) -> Result<bool, FsError> {
    blocking(move || Ok(fsx::exists(&PathBuf::from(path)))).await
}

#[tauri::command]
pub async fn fs_stat(path: String, follow: Option<bool>) -> Result<StatInfo, FsError> {
    blocking(move || fsx::stat(&PathBuf::from(path), follow.unwrap_or(true))).await
}

#[tauri::command]
pub async fn fs_read_dir(path: String) -> Result<Vec<DirEntryInfo>, FsError> {
    blocking(move || fsx::read_dir(&PathBuf::from(path))).await
}

#[tauri::command]
pub async fn fs_mkdir(path: String, recursive: Option<bool>) -> Result<(), FsError> {
    blocking(move || fsx::mkdir(&PathBuf::from(path), recursive.unwrap_or(true))).await
}

#[tauri::command]
pub async fn fs_remove(path: String, recursive: Option<bool>, force: Option<bool>) -> Result<(), FsError> {
    blocking(move || fsx::remove(&PathBuf::from(path), recursive.unwrap_or(false), force.unwrap_or(false))).await
}

#[tauri::command]
pub async fn fs_rename(from: String, to: String) -> Result<(), FsError> {
    blocking(move || fsx::rename(&PathBuf::from(from), &PathBuf::from(to))).await
}

#[tauri::command]
pub async fn fs_copy(from: String, to: String) -> Result<u64, FsError> {
    blocking(move || fsx::copy(&PathBuf::from(from), &PathBuf::from(to))).await
}

#[tauri::command]
pub async fn fs_read_text(path: String) -> Result<String, FsError> {
    blocking(move || fsx::read_text(&PathBuf::from(path))).await
}

#[tauri::command]
pub async fn fs_write_text(path: String, data: String) -> Result<(), FsError> {
    blocking(move || fsx::write_text(&PathBuf::from(path), &data)).await
}

fn decode(base64: &str) -> Result<Vec<u8>, FsError> {
    base64::engine::general_purpose::STANDARD.decode(base64).map_err(|e| FsError::new("EINVAL", e.to_string()))
}

#[tauri::command]
pub async fn fs_write_bytes(path: String, base64: String) -> Result<(), FsError> {
    let data = decode(&base64)?;
    blocking(move || fsx::write_bytes(&PathBuf::from(path), &data)).await
}

#[tauri::command]
pub async fn fs_append_bytes(path: String, base64: String) -> Result<(), FsError> {
    let data = decode(&base64)?;
    blocking(move || fsx::append_bytes(&PathBuf::from(path), &data)).await
}

#[tauri::command]
pub async fn fs_read_range(path: String, start: u64, length: usize) -> Result<String, FsError> {
    let bytes = blocking(move || fsx::read_range(&PathBuf::from(path), start, length.min(64 * 1024 * 1024))).await?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

#[tauri::command]
pub async fn fs_dir_size(path: String) -> Result<u64, FsError> {
    blocking(move || Ok(fsx::dir_size(&PathBuf::from(path)))).await
}
