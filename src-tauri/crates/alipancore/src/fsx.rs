//! Thin file system helpers with Node.js style error codes so the renderer can keep its
//! `FileSystemErrorMessage(code, message)` mapping.

use std::fs;
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::Path;
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, thiserror::Error)]
#[error("{code}: {message}")]
pub struct FsError {
    pub code: String,
    pub message: String,
}

impl FsError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        FsError { code: code.to_string(), message: message.into() }
    }
}

fn errno_code(errno: i32) -> Option<&'static str> {
    // Linux/macOS/Windows CRT share these low numbers for the common cases.
    Some(match errno {
        1 => "EPERM",
        2 => "ENOENT",
        5 => "EIO",
        13 => "EACCES",
        16 => "EBUSY",
        17 => "EEXIST",
        20 => "ENOTDIR",
        21 => "EISDIR",
        24 => "EMFILE",
        27 => "EFBIG",
        28 => "ENOSPC",
        30 => "EROFS",
        36 | 63 => "ENAMETOOLONG",
        39 | 66 => "ENOTEMPTY",
        40 | 62 => "ELOOP",
        _ => return None,
    })
}

impl From<io::Error> for FsError {
    fn from(err: io::Error) -> Self {
        let code = match err.kind() {
            io::ErrorKind::NotFound => "ENOENT",
            io::ErrorKind::PermissionDenied => "EACCES",
            io::ErrorKind::AlreadyExists => "EEXIST",
            io::ErrorKind::IsADirectory => "EISDIR",
            io::ErrorKind::NotADirectory => "ENOTDIR",
            io::ErrorKind::DirectoryNotEmpty => "ENOTEMPTY",
            io::ErrorKind::TimedOut => "ETIMEDOUT",
            io::ErrorKind::ReadOnlyFilesystem => "EROFS",
            io::ErrorKind::StorageFull => "ENOSPC",
            io::ErrorKind::InvalidFilename => "ENAMETOOLONG",
            _ => err.raw_os_error().and_then(errno_code).unwrap_or(""),
        };
        FsError { code: code.to_string(), message: err.to_string() }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatInfo {
    pub is_file: bool,
    pub is_directory: bool,
    pub is_symlink: bool,
    pub size: u64,
    pub mtime_ms: u64,
    pub birthtime_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntryInfo {
    pub name: String,
    pub is_file: bool,
    pub is_directory: bool,
    pub is_symlink: bool,
}

fn system_time_ms(t: io::Result<std::time::SystemTime>) -> u64 {
    t.ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0)
}

pub fn exists(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok()
}

/// `follow == true` behaves like `fs.stat`, `false` like `fs.lstat`.
pub fn stat(path: &Path, follow: bool) -> Result<StatInfo, FsError> {
    let meta = if follow { fs::metadata(path)? } else { fs::symlink_metadata(path)? };
    Ok(StatInfo {
        is_file: meta.is_file(),
        is_directory: meta.is_dir(),
        is_symlink: meta.file_type().is_symlink(),
        size: meta.len(),
        mtime_ms: system_time_ms(meta.modified()),
        birthtime_ms: system_time_ms(meta.created()),
    })
}

pub fn read_dir(path: &Path) -> Result<Vec<DirEntryInfo>, FsError> {
    let mut out = Vec::new();
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let ft = entry.file_type()?;
        out.push(DirEntryInfo {
            name: entry.file_name().to_string_lossy().into_owned(),
            is_file: ft.is_file(),
            is_directory: ft.is_dir(),
            is_symlink: ft.is_symlink(),
        });
    }
    Ok(out)
}

pub fn mkdir(path: &Path, recursive: bool) -> Result<(), FsError> {
    if recursive {
        fs::create_dir_all(path)?;
    } else {
        fs::create_dir(path)?;
    }
    Ok(())
}

/// Like `fs.rm(path, { recursive, force })`.
pub fn remove(path: &Path, recursive: bool, force: bool) -> Result<(), FsError> {
    let meta = match fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(e) if e.kind() == io::ErrorKind::NotFound && force => return Ok(()),
        Err(e) => return Err(e.into()),
    };
    let result = if meta.is_dir() {
        if recursive {
            fs::remove_dir_all(path)
        } else {
            fs::remove_dir(path)
        }
    } else {
        fs::remove_file(path)
    };
    match result {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == io::ErrorKind::NotFound && force => Ok(()),
        Err(e) => Err(e.into()),
    }
}

pub fn rename(from: &Path, to: &Path) -> Result<(), FsError> {
    fs::rename(from, to)?;
    Ok(())
}

pub fn read_text(path: &Path) -> Result<String, FsError> {
    Ok(fs::read_to_string(path)?)
}

pub fn write_text(path: &Path, data: &str) -> Result<(), FsError> {
    fs::write(path, data)?;
    Ok(())
}

pub fn write_bytes(path: &Path, data: &[u8]) -> Result<(), FsError> {
    fs::write(path, data)?;
    Ok(())
}

pub fn append_bytes(path: &Path, data: &[u8]) -> Result<(), FsError> {
    let mut f = fs::OpenOptions::new().append(true).create(true).open(path)?;
    f.write_all(data)?;
    Ok(())
}

pub fn read_range(path: &Path, start: u64, len: usize) -> Result<Vec<u8>, FsError> {
    let mut f = fs::File::open(path)?;
    f.seek(SeekFrom::Start(start))?;
    let mut buf = vec![0u8; len];
    let mut filled = 0;
    while filled < len {
        let n = f.read(&mut buf[filled..])?;
        if n == 0 {
            break;
        }
        filled += n;
    }
    buf.truncate(filled);
    Ok(buf)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn basic_operations() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let sub = root.join("a/b");
        mkdir(&sub, true).unwrap();
        write_text(&sub.join("x.txt"), "hello").unwrap();
        append_bytes(&sub.join("x.txt"), b" world").unwrap();
        assert_eq!(read_text(&sub.join("x.txt")).unwrap(), "hello world");
        assert_eq!(read_range(&sub.join("x.txt"), 6, 100).unwrap(), b"world");
        let st = stat(&sub.join("x.txt"), true).unwrap();
        assert!(st.is_file && !st.is_directory && st.size == 11);
        let entries = read_dir(&root.join("a")).unwrap();
        assert_eq!(entries.len(), 1);
        assert!(entries[0].is_directory && entries[0].name == "b");
        rename(&sub.join("x.txt"), &sub.join("y.txt")).unwrap();
        assert!(exists(&sub.join("y.txt")) && !exists(&sub.join("x.txt")));
        let err = stat(&root.join("missing"), true).unwrap_err();
        assert_eq!(err.code, "ENOENT");
        remove(&root.join("missing"), false, true).unwrap();
        assert!(remove(&root.join("missing"), false, false).is_err());
        remove(&root.join("a"), true, false).unwrap();
        assert!(!exists(&root.join("a")));
    }
}
