//! Platform independent core of AlipanBuddy.
//!
//! Everything in this crate is free of Tauri/GTK dependencies so it can be unit tested on any
//! machine with `cargo test -p alipancore`. The Tauri application (`src-tauri/src`) is a thin glue
//! layer over these modules.

pub mod aria;
pub mod bodybridge;
pub mod encfile;
pub mod flowenc;
pub mod fsx;
pub mod hashing;
pub mod namecodec;
pub mod net;
pub mod proxy;
pub mod speed;
pub mod upload;
