//! File hashing helpers used by the upload pipeline (SHA1 content hash, pre-hash and the
//! Aliyun "proof code").

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

use base64::Engine;
use md5::Md5;
use sha1::{Digest, Sha1};

pub fn sha1_hex_upper(data: &[u8]) -> String {
    hex::encode_upper(Sha1::digest(data))
}

pub fn md5_hex(data: &[u8]) -> String {
    hex::encode(Md5::digest(data))
}

/// SHA1 of the first 1024 bytes of the file. Like the JS implementation the buffer is zero
/// padded when the file is shorter than 1 KiB.
pub fn prehash(path: &Path) -> std::io::Result<String> {
    let mut file = File::open(path)?;
    let mut buf = [0u8; 1024];
    let mut read = 0;
    while read < buf.len() {
        let n = file.read(&mut buf[read..])?;
        if n == 0 {
            break;
        }
        read += n;
    }
    Ok(sha1_hex_upper(&buf))
}

/// Streams the whole file through SHA1. `progress(read, size)` is invoked after every chunk and
/// `cancel` is polled between chunks; returns `None` when cancelled.
pub fn sha1_file(path: &Path, cancel: &AtomicBool, mut progress: impl FnMut(u64, u64)) -> std::io::Result<Option<String>> {
    let mut file = File::open(path)?;
    let size = file.metadata()?.len();
    let mut hasher = Sha1::new();
    let mut buf = vec![0u8; 4 * 1024 * 1024];
    let mut read: u64 = 0;
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Ok(None);
        }
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        read += n as u64;
        progress(read, size);
    }
    Ok(Some(hex::encode_upper(hasher.finalize())))
}

fn proof_start(access_token: &str, size: u64) -> u64 {
    let md5 = md5_hex(access_token.as_bytes());
    let value = u64::from_str_radix(&md5[..16], 16).unwrap_or(0);
    value % size
}

/// Aliyun `proof_code`: 8 bytes of the file starting at `md5(token)[0..16] % size`, base64 encoded.
pub fn proof_code(path: &Path, access_token: &str, size: u64) -> std::io::Result<String> {
    if size == 0 {
        return Ok(String::new());
    }
    let start = proof_start(access_token, size);
    let end = (start + 8).min(size);
    let mut file = File::open(path)?;
    file.seek(SeekFrom::Start(start))?;
    let mut buf = vec![0u8; (end - start) as usize];
    let mut filled = 0;
    while filled < buf.len() {
        let n = file.read(&mut buf[filled..])?;
        if n == 0 {
            break;
        }
        filled += n;
    }
    buf.truncate(filled);
    Ok(base64::engine::general_purpose::STANDARD.encode(buf))
}

/// Same as [`proof_code`] for an in-memory buffer.
pub fn proof_code_bytes(data: &[u8], access_token: &str) -> String {
    if data.is_empty() {
        return String::new();
    }
    let start = proof_start(access_token, data.len() as u64) as usize;
    let end = (start + 8).min(data.len());
    base64::engine::general_purpose::STANDARD.encode(&data[start..end])
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn empty_sha1() {
        assert_eq!(sha1_hex_upper(b""), "DA39A3EE5E6B4B0D3255BFEF95601890AFD80709");
    }

    #[test]
    fn proof_code_bytes_matches_js_formula() {
        // md5("token") = 94a08da1fecbb6e8b46990538c7b50b2 -> 0x94a08da1fecbb6e8 % 26 = 0
        let data: Vec<u8> = (b'a'..=b'z').collect();
        assert_eq!(proof_code_bytes(&data, "token"), base64::engine::general_purpose::STANDARD.encode(b"abcdefgh"));
    }

    #[test]
    fn file_hashing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("f.bin");
        let data: Vec<u8> = (0..5000u32).map(|i| (i % 256) as u8).collect();
        File::create(&path).unwrap().write_all(&data).unwrap();
        let cancel = AtomicBool::new(false);
        let mut calls = 0;
        let hash = sha1_file(&path, &cancel, |_, _| calls += 1).unwrap().unwrap();
        assert_eq!(hash, sha1_hex_upper(&data));
        assert!(calls >= 1);
        let mut padded = [0u8; 1024];
        padded.copy_from_slice(&data[..1024]);
        assert_eq!(prehash(&path).unwrap(), sha1_hex_upper(&padded));
        assert_eq!(proof_code(&path, "token", data.len() as u64).unwrap(), proof_code_bytes(&data, "token"));
        cancel.store(true, Ordering::Relaxed);
        assert!(sha1_file(&path, &cancel, |_, _| {}).unwrap().is_none());
    }
}
