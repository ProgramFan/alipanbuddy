//! Streams a byte range of a local file to an Aliyun OSS upload url (optionally encrypting it on
//! the fly). Port of `AliUploadDisk.UploadOneFilePartNode`.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use bytes::Bytes;
use futures_util::stream;
use tokio::io::{AsyncReadExt, AsyncSeekExt};

use crate::flowenc::{Alg, FlowEnc};
use crate::speed::SpeedLimiter;

const CHUNK: usize = 256 * 1024;

#[derive(Debug, Clone)]
pub struct UploadEncryption {
    pub alg: Alg,
    pub password: String,
    pub file_size: u64,
}

#[derive(Debug, Clone)]
pub struct UploadPartRequest {
    pub path: PathBuf,
    pub start: u64,
    pub size: u64,
    pub url: String,
    pub authorization: String,
    pub encryption: Option<UploadEncryption>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct UploadPartResult {
    pub status: u16,
    pub body: String,
}

#[derive(Debug, thiserror::Error)]
pub enum UploadError {
    #[error("读取文件数据失败: {0}")]
    File(#[from] std::io::Error),
    #[error(transparent)]
    Enc(#[from] crate::flowenc::FlowEncError),
    #[error("{0}")]
    Http(#[from] reqwest::Error),
    #[error("已暂停")]
    Cancelled,
}

pub fn build_client(proxy: Option<&str>) -> reqwest::Client {
    let mut builder = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .connect_timeout(Duration::from_secs(15))
        .read_timeout(Duration::from_secs(30))
        .pool_max_idle_per_host(8);
    if let Some(p) = proxy.filter(|p| !p.is_empty()) {
        if let Ok(px) = reqwest::Proxy::all(p) {
            builder = builder.proxy(px);
        }
    } else {
        builder = builder.no_proxy();
    }
    builder.build().unwrap_or_else(|_| reqwest::Client::new())
}

struct ReadState {
    file: tokio::fs::File,
    remaining: u64,
    position: u64,
    flow: Option<FlowEnc>,
    cancel: Arc<AtomicBool>,
    limiter: Arc<SpeedLimiter>,
    progress: Arc<dyn Fn(u64, u64) + Send + Sync>,
}

/// PUTs `size` bytes starting at `start` of `path` to `url`. `progress(position, delta)` reports the
/// absolute file offset that has been handed to the network layer.
pub async fn upload_part(
    client: &reqwest::Client,
    req: UploadPartRequest,
    cancel: Arc<AtomicBool>,
    limiter: Arc<SpeedLimiter>,
    progress: Arc<dyn Fn(u64, u64) + Send + Sync>,
) -> Result<UploadPartResult, UploadError> {
    let mut file = tokio::fs::File::open(&req.path).await?;
    file.seek(std::io::SeekFrom::Start(req.start)).await?;
    let flow = match &req.encryption {
        Some(e) => {
            let mut f = FlowEnc::new(&e.password, e.alg, e.file_size)?;
            f.set_position(req.start);
            Some(f)
        }
        None => None,
    };
    let state = ReadState { file, remaining: req.size, position: req.start, flow, cancel, limiter, progress };
    let body_stream = stream::unfold(state, |mut st| async move {
        if st.remaining == 0 {
            return None;
        }
        if st.cancel.load(Ordering::Relaxed) {
            return Some((Err(std::io::Error::other("cancelled")), st));
        }
        let want = (st.remaining as usize).min(CHUNK);
        let mut buf = vec![0u8; want];
        let mut filled = 0;
        while filled < want {
            match st.file.read(&mut buf[filled..]).await {
                Ok(0) => break,
                Ok(n) => filled += n,
                Err(e) => return Some((Err(e), st)),
            }
        }
        if filled == 0 {
            return Some((Err(std::io::Error::new(std::io::ErrorKind::UnexpectedEof, "file shorter than expected")), st));
        }
        buf.truncate(filled);
        if let Some(f) = st.flow.as_mut() {
            f.process(&mut buf);
        }
        st.limiter.acquire(filled as u64).await;
        st.remaining -= filled as u64;
        st.position += filled as u64;
        (st.progress)(st.position, filled as u64);
        Some((Ok::<Bytes, std::io::Error>(Bytes::from(buf)), st))
    });

    let response = client
        .put(&req.url)
        .header(reqwest::header::CONTENT_TYPE, "")
        .header(reqwest::header::CONTENT_LENGTH, req.size)
        .header(reqwest::header::AUTHORIZATION, &req.authorization)
        .header(reqwest::header::CONNECTION, "keep-alive")
        .body(reqwest::Body::wrap_stream(body_stream))
        .send()
        .await
        .map_err(|e| if req_cancelled(&e) { UploadError::Cancelled } else { UploadError::Http(e) })?;
    let status = response.status().as_u16();
    let body = response.text().await.unwrap_or_default();
    Ok(UploadPartResult { status, body })
}

fn req_cancelled(err: &reqwest::Error) -> bool {
    err.to_string().contains("cancelled")
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::extract::Request;
    use axum::response::Response;
    use axum::Router;
    use http_body_util::BodyExt;
    use parking_lot::Mutex;

    #[tokio::test]
    async fn uploads_encrypted_range() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("big.bin");
        let data: Vec<u8> = (0..1_000_000u32).map(|i| (i % 253) as u8).collect();
        std::fs::write(&path, &data).unwrap();

        let received: Arc<Mutex<Vec<u8>>> = Arc::new(Mutex::new(Vec::new()));
        let seen_len: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
        let app = Router::new().fallback({
            let received = received.clone();
            let seen_len = seen_len.clone();
            move |req: Request| {
                let received = received.clone();
                let seen_len = seen_len.clone();
                async move {
                    *seen_len.lock() = req.headers().get("content-length").and_then(|v| v.to_str().ok()).map(|s| s.to_string());
                    let bytes = req.into_body().collect().await.unwrap().to_bytes();
                    received.lock().extend_from_slice(&bytes);
                    Response::builder().status(200).body(Body::from("ok")).unwrap()
                }
            }
        });
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });

        let progress_calls = Arc::new(Mutex::new(Vec::<(u64, u64)>::new()));
        let pc = progress_calls.clone();
        let result = upload_part(
            &build_client(None),
            UploadPartRequest {
                path: path.clone(),
                start: 300_000,
                size: 400_000,
                url: format!("http://127.0.0.1:{port}/part"),
                authorization: "Bearer x".into(),
                encryption: Some(UploadEncryption { alg: Alg::Rc4Md5, password: "pw".into(), file_size: data.len() as u64 }),
            },
            Arc::new(AtomicBool::new(false)),
            Arc::new(SpeedLimiter::new(0)),
            Arc::new(move |pos, delta| pc.lock().push((pos, delta))),
        )
        .await
        .unwrap();
        assert_eq!(result.status, 200);
        assert_eq!(result.body, "ok");
        assert_eq!(seen_len.lock().as_deref(), Some("400000"));

        let mut expected = data[300_000..700_000].to_vec();
        let mut flow = FlowEnc::new("pw", Alg::Rc4Md5, data.len() as u64).unwrap();
        flow.set_position(300_000);
        flow.process(&mut expected);
        assert_eq!(*received.lock(), expected);
        let calls = progress_calls.lock();
        assert_eq!(calls.last().unwrap().0, 700_000);
        assert_eq!(calls.iter().map(|c| c.1).sum::<u64>(), 400_000);
    }
}
