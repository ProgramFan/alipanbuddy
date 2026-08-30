//! Whole-file encryption/decryption used by the "文件加密" add-on tool (`src/rss/rssjiami`).

use std::fs::File;
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::Path;

use crate::flowenc::{Alg, FlowEnc};

#[derive(Debug, thiserror::Error)]
pub enum EncFileError {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Enc(#[from] crate::flowenc::FlowEncError),
}

/// Encrypts (or decrypts - the ciphers are symmetric) `src` into `dst`. The file size is used as
/// salt exactly like the JS implementation (`new FlowEnc(password, encType, size)`).
pub fn transform_file(alg: Alg, password: &str, src: &Path, dst: &Path) -> Result<u64, EncFileError> {
    let size = std::fs::metadata(src)?.len();
    if size == 0 {
        File::create(dst)?;
        return Ok(0);
    }
    let mut flow = FlowEnc::new(password, alg, size)?;
    let mut reader = BufReader::new(File::open(src)?);
    let mut writer = BufWriter::new(File::create(dst)?);
    let mut buf = vec![0u8; 256 * 1024];
    let mut total = 0u64;
    loop {
        let n = reader.read(&mut buf)?;
        if n == 0 {
            break;
        }
        flow.process(&mut buf[..n]);
        writer.write_all(&buf[..n])?;
        total += n as u64;
    }
    writer.flush()?;
    Ok(total)
}

/// Encrypt/decrypt an in-memory buffer with `size_salt` as salt.
pub fn transform_bytes(alg: Alg, password: &str, size_salt: u64, data: &mut [u8]) -> Result<(), crate::flowenc::FlowEncError> {
    let mut flow = FlowEnc::new(password, alg, size_salt)?;
    flow.process(data);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("plain.bin");
        let enc = dir.path().join("enc.bin");
        let dec = dir.path().join("dec.bin");
        let data: Vec<u8> = (0..300_000u32).map(|i| (i * 31 % 256) as u8).collect();
        std::fs::write(&src, &data).unwrap();
        for alg in [Alg::AesCtr, Alg::Rc4Md5] {
            transform_file(alg, "secret", &src, &enc).unwrap();
            assert_ne!(std::fs::read(&enc).unwrap(), data);
            transform_file(alg, "secret", &enc, &dec).unwrap();
            assert_eq!(std::fs::read(&dec).unwrap(), data);
        }
    }
}
