//! Bundled aria2c lifecycle (sidecar spawn / readiness / shutdown).

use std::fs::File;
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

use boxcore::aria::{self, AriaLaunchConfig, DEFAULT_RPC_PORT, DEFAULT_RPC_SECRET};
use tauri::{AppHandle, Manager};

use crate::state::AppState;

/// Embedded so a portable build never depends on Tauri's resource directory resolution.
const ARIA2_CONF: &str = include_str!("../resources/aria2.conf");

pub struct AriaEngine {
    child: Child,
    pub port: u16,
    pub secret: String,
}

fn sidecar_path() -> Option<PathBuf> {
    let name = if cfg!(windows) { "aria2c.exe" } else { "aria2c" };
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let bundled = dir.join(name);
            if bundled.exists() {
                return Some(bundled);
            }
        }
    }
    // `tauri dev`: src-tauri/binaries/aria2c-<triple>
    let triple = tauri::utils::platform::target_triple().ok()?;
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries").join(format!("aria2c-{triple}{}", if cfg!(windows) { ".exe" } else { "" }));
    if dev.exists() {
        return Some(dev);
    }
    None
}

/// Writes the embedded aria2.conf next to the user data (kept in sync with the binary).
fn ensure_conf(user_data: &std::path::Path) -> Result<PathBuf, String> {
    let dir = user_data.join("engine");
    std::fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    let conf = dir.join("aria2.conf");
    let current = std::fs::read_to_string(&conf).unwrap_or_default();
    if current != ARIA2_CONF {
        std::fs::write(&conf, ARIA2_CONF).map_err(|e| format!("write {}: {e}", conf.display()))?;
    }
    Ok(conf)
}

fn wait_for_port(port: u16, child: &mut Child, timeout: Duration) -> Result<(), String> {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if let Ok(Some(status)) = child.try_wait() {
            return Err(format!("aria2c exited early ({status})"));
        }
        if TcpStream::connect_timeout(&(std::net::Ipv4Addr::LOCALHOST, port).into(), Duration::from_millis(200)).is_ok() {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    Err(format!("aria2c did not open RPC port {port} in time"))
}

impl AriaEngine {
    pub fn start(app: &AppHandle) -> Result<AriaEngine, String> {
        let state = app.state::<AppState>();
        let bin = sidecar_path().ok_or_else(|| "aria2c binary missing (expected next to the AlipanBuddy executable)".to_string())?;
        let port = aria::find_free_port(DEFAULT_RPC_PORT);
        let user_data = state.user_data.clone();
        let download_dir = app.path().download_dir().unwrap_or_else(|_| user_data.clone());
        let cfg = AriaLaunchConfig {
            conf_path: ensure_conf(&user_data)?,
            session_path: aria::session_path(&user_data),
            parent_pid: std::process::id(),
            rpc_port: port,
            rpc_secret: DEFAULT_RPC_SECRET.to_string(),
            download_dir,
            dht_path: user_data.join("dht.dat"),
            dht6_path: user_data.join("dht6.dat"),
            user_agent: aria::CHROME_UA.to_string(),
        };
        let args = aria::build_args(&cfg);
        log::info!("starting aria2c {} on port {port}", bin.display());
        let log_path = user_data.join("aria2.log");
        let log_file = File::create(&log_path).ok();
        let mut command = Command::new(&bin);
        command.args(&args).stdin(Stdio::null());
        match log_file {
            Some(f) => {
                let err = f.try_clone().ok();
                command.stdout(Stdio::from(f));
                if let Some(e) = err {
                    command.stderr(Stdio::from(e));
                } else {
                    command.stderr(Stdio::null());
                }
            }
            None => {
                command.stdout(Stdio::null()).stderr(Stdio::null());
            }
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        }
        let mut child = command.spawn().map_err(|e| format!("spawn aria2c failed: {e}"))?;
        let _ = std::fs::write(user_data.join("engine.pid"), child.id().to_string());
        if let Err(err) = wait_for_port(port, &mut child, Duration::from_secs(8)) {
            let tail = std::fs::read_to_string(&log_path).unwrap_or_default();
            let tail: String = tail.lines().rev().take(5).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join(" | ");
            let _ = child.kill();
            return Err(format!("{err}: {tail}"));
        }
        Ok(AriaEngine { child, port, secret: DEFAULT_RPC_SECRET.to_string() })
    }

    pub fn is_alive(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }

    pub fn kill(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl Drop for AriaEngine {
    fn drop(&mut self) {
        self.kill();
    }
}

/// Returns the RPC port of a running engine, starting it when needed.
pub fn ensure_running(app: &AppHandle) -> Result<u16, String> {
    let state = app.state::<AppState>();
    let mut guard = state.aria.lock();
    if let Some(engine) = guard.as_mut() {
        if engine.is_alive() {
            return Ok(engine.port);
        }
        log::warn!("aria2c exited, restarting");
        *guard = None;
    }
    let engine = AriaEngine::start(app).map_err(|e| {
        log::error!("{e}");
        e
    })?;
    let port = engine.port;
    *guard = Some(engine);
    Ok(port)
}

pub fn restart(app: &AppHandle) -> Result<u16, String> {
    shutdown_blocking(app);
    ensure_running(app)
}

/// Graceful shutdown: `aria2.forceShutdown` over RPC (bounded), then kill.
pub fn shutdown_blocking(app: &AppHandle) {
    let state = app.state::<AppState>();
    let engine = state.aria.lock().take();
    let Some(mut engine) = engine else { return };
    let client = state.rpc_client.clone();
    let (port, secret) = (engine.port, engine.secret.clone());
    let rt = tauri::async_runtime::handle();
    let _ = rt.block_on(async move { tokio::time::timeout(Duration::from_millis(1500), aria::force_shutdown(&client, port, &secret)).await });
    std::thread::sleep(Duration::from_millis(200));
    engine.kill();
    let _ = std::fs::remove_file(state.user_file("engine.pid"));
}
