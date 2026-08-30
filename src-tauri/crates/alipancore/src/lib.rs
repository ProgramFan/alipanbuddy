//! Platform independent core of AlipanBuddy.
//!
//! Everything in this crate is free of Tauri/GTK dependencies so it can be unit tested on any
//! machine with `cargo test -p alipancore`. The Tauri application (`src-tauri/src`) is a thin glue
//! layer over these modules.

pub mod aria;
pub mod encfile;
pub mod flowenc;
pub mod fsx;
pub mod hashing;
pub mod namecodec;
pub mod proxy;
pub mod speed;
pub mod upload;

/// User agent Electron injected for every request to Aliyun Drive hosts.
pub const ALIYUN_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0";
