//! Shared reqwest setup. Every client in the app talks to the same hosts through the same
//! (optional) user proxy, so the certificate policy and the proxy branch live here; the per-use
//! timeouts / pool sizes stay at the call sites.

use std::time::Duration;

/// Aliyun's download CDNs hand out certificates that do not match the host they were fetched from,
/// which is why invalid certificates are accepted. `proxy` is the user's proxy url; `None` or an
/// empty string means a direct connection (and explicitly ignores the ambient `*_proxy` env vars).
/// An unparsable proxy url is left to reqwest's own defaults, exactly like before.
pub fn client_builder(proxy: Option<&str>) -> reqwest::ClientBuilder {
    let mut builder = reqwest::Client::builder().danger_accept_invalid_certs(true);
    match proxy.filter(|p| !p.is_empty()) {
        Some(p) => {
            if let Ok(px) = reqwest::Proxy::all(p) {
                builder = builder.proxy(px);
            }
        }
        None => builder = builder.no_proxy(),
    }
    builder
}

/// Builds the client, falling back to a default one rather than failing the caller.
pub fn build(builder: reqwest::ClientBuilder) -> reqwest::Client {
    builder.build().unwrap_or_else(|_| reqwest::Client::new())
}

/// Short-lived loopback client (aria2's JSON-RPC endpoint).
pub fn loopback_client(timeout: Duration) -> reqwest::Client {
    build(client_builder(None).timeout(timeout))
}
