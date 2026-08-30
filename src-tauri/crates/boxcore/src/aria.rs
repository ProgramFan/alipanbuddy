//! aria2c launch arguments and JSON-RPC helpers (the process itself is spawned by the Tauri
//! layer because the sidecar path comes from the bundle).

use std::net::TcpListener;
use std::path::{Path, PathBuf};

use serde_json::{json, Value};

pub const DEFAULT_RPC_PORT: u16 = 16800;
pub const DEFAULT_RPC_SECRET: &str = "S4znWTaZYQi3cpRNb";
pub const CHROME_UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36";

#[derive(Debug, Clone)]
pub struct AriaLaunchConfig {
    pub conf_path: PathBuf,
    pub session_path: PathBuf,
    pub parent_pid: u32,
    pub rpc_port: u16,
    pub rpc_secret: String,
    pub download_dir: PathBuf,
    pub dht_path: PathBuf,
    pub dht6_path: PathBuf,
    pub user_agent: String,
}

fn opt(key: &str, value: impl std::fmt::Display) -> String {
    format!("--{key}={value}")
}

/// Mirrors the defaults of the former Motrix `ConfigManager` system config.
pub fn build_args(cfg: &AriaLaunchConfig) -> Vec<String> {
    let mut args = vec![
        opt("conf-path", cfg.conf_path.display()),
        opt("save-session", cfg.session_path.display()),
        // aria2c exits on its own if AlipanBuddy dies without a clean shutdown.
        opt("stop-with-process", cfg.parent_pid),
    ];
    if cfg.session_path.exists() {
        args.push(opt("input-file", cfg.session_path.display()));
    }
    args.extend([
        opt("rpc-listen-port", cfg.rpc_port),
        opt("rpc-secret", &cfg.rpc_secret),
        opt("dir", cfg.download_dir.display()),
        opt("dht-file-path", cfg.dht_path.display()),
        opt("dht-file-path6", cfg.dht6_path.display()),
        opt("user-agent", &cfg.user_agent),
        opt("allow-overwrite", "false"),
        opt("auto-file-renaming", "true"),
        opt("bt-force-encryption", "false"),
        opt("bt-load-saved-metadata", "true"),
        opt("bt-save-metadata", "true"),
        opt("continue", "true"),
        opt("dht-listen-port", 26701),
        opt("enable-dht6", "true"),
        opt("follow-metalink", "true"),
        opt("follow-torrent", "true"),
        opt("listen-port", 21301),
        opt("max-concurrent-downloads", 10),
        opt("max-connection-per-server", 64),
        opt("max-download-limit", 0),
        opt("max-overall-download-limit", 0),
        opt("max-overall-upload-limit", 0),
        opt("pause-metadata", "false"),
        opt("seed-ratio", 2),
        opt("seed-time", 2880),
        opt("split", 64),
    ]);
    args
}

/// First TCP port >= `start` that can be bound on 127.0.0.1.
pub fn find_free_port(start: u16) -> u16 {
    let mut port = start;
    loop {
        if TcpListener::bind(("127.0.0.1", port)).is_ok() {
            return port;
        }
        if port == u16::MAX {
            return start;
        }
        port += 1;
    }
}

pub async fn rpc_call(client: &reqwest::Client, port: u16, secret: &str, method: &str, mut params: Vec<Value>) -> Result<Value, reqwest::Error> {
    params.insert(0, Value::String(format!("token:{secret}")));
    let body = json!({ "jsonrpc": "2.0", "id": "alipanbuddy", "method": format!("aria2.{method}"), "params": params });
    let resp = client.post(format!("http://127.0.0.1:{port}/jsonrpc")).json(&body).send().await?;
    resp.json::<Value>().await
}

pub async fn force_shutdown(client: &reqwest::Client, port: u16, secret: &str) -> bool {
    rpc_call(client, port, secret, "forceShutdown", vec![]).await.is_ok()
}

pub fn session_path(user_data: &Path) -> PathBuf {
    user_data.join("download.session")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn args_contain_required_flags() {
        let cfg = AriaLaunchConfig {
            conf_path: "/tmp/aria2.conf".into(),
            session_path: "/tmp/definitely-missing-session".into(),
            parent_pid: 42,
            rpc_port: 16800,
            rpc_secret: "s".into(),
            download_dir: "/tmp/dl".into(),
            dht_path: "/tmp/dht.dat".into(),
            dht6_path: "/tmp/dht6.dat".into(),
            user_agent: "ua".into(),
        };
        let args = build_args(&cfg);
        assert!(args.contains(&"--rpc-listen-port=16800".to_string()));
        assert!(args.contains(&"--stop-with-process=42".to_string()));
        assert!(args.contains(&"--rpc-secret=s".to_string()));
        assert!(!args.iter().any(|a| a.starts_with("--input-file")));
    }

    #[test]
    fn free_port_is_bindable() {
        let port = find_free_port(40000);
        assert!(TcpListener::bind(("127.0.0.1", port)).is_ok());
    }
}
