//! Global upload speed limiter (token bucket refilled once per second, mirroring the old
//! `window.speedLimte` counter that `UploadReport()` reset every second).

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use parking_lot::Mutex;

pub struct SpeedLimiter {
    limit: AtomicU64,
    state: Mutex<(f64, Instant)>,
}

impl Default for SpeedLimiter {
    fn default() -> Self {
        SpeedLimiter::new(0)
    }
}

impl SpeedLimiter {
    /// `bytes_per_second == 0` means unlimited.
    pub fn new(bytes_per_second: u64) -> Self {
        SpeedLimiter { limit: AtomicU64::new(bytes_per_second), state: Mutex::new((bytes_per_second as f64, Instant::now())) }
    }

    pub fn set_limit(&self, bytes_per_second: u64) {
        self.limit.store(bytes_per_second, Ordering::Relaxed);
        let mut st = self.state.lock();
        st.0 = st.0.min(bytes_per_second as f64);
    }

    pub fn limit(&self) -> u64 {
        self.limit.load(Ordering::Relaxed)
    }

    /// Waits until `bytes` may be sent.
    pub async fn acquire(&self, bytes: u64) {
        loop {
            let limit = self.limit();
            if limit == 0 {
                return;
            }
            let wait = {
                let mut st = self.state.lock();
                let now = Instant::now();
                let elapsed = now.duration_since(st.1).as_secs_f64();
                st.0 = (st.0 + elapsed * limit as f64).min(limit as f64);
                st.1 = now;
                let need = bytes as f64;
                if st.0 >= need {
                    st.0 -= need;
                    None
                } else {
                    Some(Duration::from_secs_f64(((need - st.0) / limit as f64).min(2.0)))
                }
            };
            match wait {
                None => return,
                Some(d) => tokio::time::sleep(d).await,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn unlimited_never_blocks() {
        let l = SpeedLimiter::new(0);
        let start = Instant::now();
        for _ in 0..100 {
            l.acquire(1 << 20).await;
        }
        assert!(start.elapsed() < Duration::from_millis(200));
    }

    #[tokio::test]
    async fn limited_throttles() {
        let l = SpeedLimiter::new(1000);
        let start = Instant::now();
        l.acquire(1000).await; // bucket starts full
        l.acquire(500).await; // needs ~0.5s refill
        assert!(start.elapsed() >= Duration::from_millis(400));
    }
}
