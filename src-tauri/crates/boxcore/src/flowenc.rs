//! Streaming file ciphers compatible with the historical JavaScript `flow-enc` module
//! (`src/module/flow-enc`). Only the two algorithms exposed in the settings UI are supported:
//! `aesctr` (AES-128-CTR) and `rc4md5` (segmented RC4 keyed by MD5).

use aes::Aes128;
use cipher::{KeyIvInit, StreamCipher, StreamCipherSeek};
use md5::{Digest, Md5};
use sha2::Sha256;

type Aes128Ctr = ctr::Ctr128BE<Aes128>;

/// RC4 re-keys itself every `RC4_SEGMENT` bytes so that random access stays cheap.
pub const RC4_SEGMENT: u64 = 100 * 10_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Alg {
    AesCtr,
    Rc4Md5,
}

impl Alg {
    pub fn parse(name: &str) -> Option<Alg> {
        match name {
            "aesctr" => Some(Alg::AesCtr),
            "rc4md5" => Some(Alg::Rc4Md5),
            _ => None,
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            Alg::AesCtr => "aesctr",
            Alg::Rc4Md5 => "rc4md5",
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum FlowEncError {
    #[error("unsupported encryption type: {0}")]
    UnsupportedAlg(String),
    #[error("salt is null")]
    NullSalt,
}

fn md5_digest(data: impl AsRef<[u8]>) -> [u8; 16] {
    let mut hasher = Md5::new();
    hasher.update(data.as_ref());
    hasher.finalize().into()
}

fn pbkdf2_hex(password: &str, salt: &str) -> String {
    let mut out = [0u8; 16];
    pbkdf2::pbkdf2_hmac::<Sha256>(password.as_bytes(), salt.as_bytes(), 1000, &mut out);
    hex::encode(out)
}

/// JavaScript `String.length` counts UTF-16 code units.
fn js_len(s: &str) -> usize {
    s.encode_utf16().count()
}

/// The "outward" password (`FlowEnc.passwdOutward`) - the value used as secret for file names.
pub fn passwd_outward(password: &str, alg: Alg) -> String {
    match alg {
        Alg::AesCtr => {
            if js_len(password) != 32 {
                pbkdf2_hex(password, "AES-CTR")
            } else {
                String::new()
            }
        }
        Alg::Rc4Md5 => {
            if js_len(password) != 32 {
                pbkdf2_hex(password, "RC4")
            } else {
                password.to_string()
            }
        }
    }
}

struct AesCtrFlow {
    key: [u8; 16],
    iv: [u8; 16],
    cipher: Aes128Ctr,
}

impl AesCtrFlow {
    fn new(password: &str, size_salt: u64) -> Self {
        let outward = passwd_outward(password, Alg::AesCtr);
        let key = md5_digest(format!("{outward}{size_salt}"));
        let iv = md5_digest(size_salt.to_string());
        let cipher = Aes128Ctr::new(&key.into(), &iv.into());
        AesCtrFlow { key, iv, cipher }
    }

    fn set_position(&mut self, position: u64) {
        self.cipher = Aes128Ctr::new(&self.key.into(), &self.iv.into());
        self.cipher.seek(position);
    }

    fn process(&mut self, data: &mut [u8]) {
        self.cipher.apply_keystream(data);
    }
}

struct Rc4Md5Flow {
    position: u64,
    i: usize,
    j: usize,
    sbox: [u8; 256],
    file_key: [u8; 16],
}

impl Rc4Md5Flow {
    fn new(password: &str, size_salt: u64) -> Result<Self, FlowEncError> {
        if size_salt == 0 {
            return Err(FlowEncError::NullSalt);
        }
        let outward = passwd_outward(password, Alg::Rc4Md5);
        let file_key = md5_digest(format!("{outward}{size_salt}"));
        let mut flow = Rc4Md5Flow { position: 0, i: 0, j: 0, sbox: [0u8; 256], file_key };
        flow.reset_ksa();
        Ok(flow)
    }

    fn reset_ksa(&mut self) {
        let offset = (self.position / RC4_SEGMENT) * RC4_SEGMENT;
        let buf = (offset as u32).to_be_bytes();
        let mut key = self.file_key;
        for (k, b) in key[12..].iter_mut().zip(buf.iter()) {
            *k ^= *b;
        }
        self.init_ksa(&key);
    }

    fn init_ksa(&mut self, key: &[u8]) {
        for (idx, slot) in self.sbox.iter_mut().enumerate() {
            *slot = idx as u8;
        }
        let mut j: usize = 0;
        for i in 0..256 {
            j = (j + self.sbox[i] as usize + key[i % key.len()] as usize) % 256;
            self.sbox.swap(i, j);
        }
        self.i = 0;
        self.j = 0;
    }

    fn set_position(&mut self, position: u64) {
        self.position = position;
        self.reset_ksa();
        let skip = position % RC4_SEGMENT;
        for _ in 0..skip {
            self.i = (self.i + 1) % 256;
            self.j = (self.j + self.sbox[self.i] as usize) % 256;
            self.sbox.swap(self.i, self.j);
        }
    }

    fn process(&mut self, data: &mut [u8]) {
        for byte in data.iter_mut() {
            self.i = (self.i + 1) % 256;
            self.j = (self.j + self.sbox[self.i] as usize) % 256;
            self.sbox.swap(self.i, self.j);
            *byte ^= self.sbox[(self.sbox[self.i] as usize + self.sbox[self.j] as usize) % 256];
            self.position += 1;
            if self.position % RC4_SEGMENT == 0 {
                self.reset_ksa();
            }
        }
    }
}

enum Inner {
    Aes(AesCtrFlow),
    Rc4(Rc4Md5Flow),
}

/// A positioned stream cipher. Encryption and decryption are the same operation.
pub struct FlowEnc {
    inner: Inner,
    alg: Alg,
}

impl FlowEnc {
    pub fn new(password: &str, alg: Alg, size_salt: u64) -> Result<Self, FlowEncError> {
        let inner = match alg {
            Alg::AesCtr => Inner::Aes(AesCtrFlow::new(password, size_salt)),
            Alg::Rc4Md5 => Inner::Rc4(Rc4Md5Flow::new(password, size_salt)?),
        };
        Ok(FlowEnc { inner, alg })
    }

    pub fn from_name(password: &str, alg: &str, size_salt: u64) -> Result<Self, FlowEncError> {
        let alg = Alg::parse(alg).ok_or_else(|| FlowEncError::UnsupportedAlg(alg.to_string()))?;
        FlowEnc::new(password, alg, size_salt)
    }

    pub fn alg(&self) -> Alg {
        self.alg
    }

    /// Reposition the keystream to absolute byte offset `position` of the file.
    pub fn set_position(&mut self, position: u64) {
        match &mut self.inner {
            Inner::Aes(a) => a.set_position(position),
            Inner::Rc4(r) => r.set_position(position),
        }
    }

    /// Encrypt or decrypt `data` in place, advancing the keystream.
    pub fn process(&mut self, data: &mut [u8]) {
        match &mut self.inner {
            Inner::Aes(a) => a.process(data),
            Inner::Rc4(r) => r.process(data),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plain() -> Vec<u8> {
        (0u8..100).collect()
    }

    #[test]
    fn outward_passwords_match_js() {
        assert_eq!(passwd_outward("test-password", Alg::AesCtr), "9e27d51469aea3266edf77f2b0f691e8");
        assert_eq!(passwd_outward("0123456789abcdef0123456789abcdef", Alg::AesCtr), "");
        assert_eq!(passwd_outward("test-password", Alg::Rc4Md5), "3123f158ef31d9039873268bf49d944d");
        assert_eq!(passwd_outward("0123456789abcdef0123456789abcdef", Alg::Rc4Md5), "0123456789abcdef0123456789abcdef");
    }

    #[test]
    fn aes_ctr_matches_js() {
        let mut e = FlowEnc::new("test-password", Alg::AesCtr, 12345).unwrap();
        let mut data = plain();
        e.process(&mut data);
        assert_eq!(hex::encode(&data), "4167538141e27c702f73564c1d378e7eaadc82110a05b75646b6326c2f51fa066be0dedb1c0fda5e18c8ed8377f0c5179fa727950bebc61ca1e2926b1fc581ae66dd44e252db027df0d471b28f1366b4170c0e76c5bcf39cfca2afdfadc9cc82ede3e346");

        let mut e2 = FlowEnc::new("test-password", Alg::AesCtr, 12345).unwrap();
        e2.set_position(37);
        let mut tail = plain()[37..].to_vec();
        e2.process(&mut tail);
        assert_eq!(hex::encode(&tail), "0fda5e18c8ed8377f0c5179fa727950bebc61ca1e2926b1fc581ae66dd44e252db027df0d471b28f1366b4170c0e76c5bcf39cfca2afdfadc9cc82ede3e346");

        let mut e3 = FlowEnc::new("0123456789abcdef0123456789abcdef", Alg::AesCtr, 7).unwrap();
        let mut d3 = plain();
        e3.process(&mut d3);
        assert_eq!(hex::encode(&d3), "ec23dd64361b95fef25b79d335179ee6a728a3ad574aac6038f26d28f8937c4291d6e22286110c3b86a21ef160a1a6d58166caa4efc362cdbbea11b859507987cd0ade1f08b1e17c5b139b10ffbcd08cdc528efd2de1924c5e01a9e15dfc1e40e805ef74");
    }

    #[test]
    fn rc4_md5_matches_js() {
        let mut e = FlowEnc::new("test-password", Alg::Rc4Md5, 12345).unwrap();
        let mut data = plain();
        e.process(&mut data);
        assert_eq!(hex::encode(&data), "3047b54578fe655df819b8d8befe8df9003f4a84babaf958b1cb445040ed891f42e2e72246cd8f94fa16223b90f2790611f89358bf400916b2d3efc16a699ba1b7d90dca79241b47e49d6ec623b7a49b4280ec8a2de91842d5d24f8fc699d5030a28a740");

        let mut e2 = FlowEnc::new("test-password", Alg::Rc4Md5, 12345).unwrap();
        e2.set_position(37);
        let mut tail = plain()[37..].to_vec();
        e2.process(&mut tail);
        assert_eq!(hex::encode(&tail), "cd8f94fa16223b90f2790611f89358bf400916b2d3efc16a699ba1b7d90dca79241b47e49d6ec623b7a49b4280ec8a2de91842d5d24f8fc699d5030a28a740");

        let mut e3 = FlowEnc::new("0123456789abcdef0123456789abcdef", Alg::Rc4Md5, 7).unwrap();
        let mut d3 = plain();
        e3.process(&mut d3);
        assert_eq!(hex::encode(&d3), "cee4fd9720067851f16a764dcb538156030b5872c3e3ce842f57a0d4bab523bba75e6556514c9bbbde57b92f72411f760c6dca58bf513b6ba0a3e8d6abed1ab1017777b112699c53ff417efe5405781243e03182fc457f59f174753ba5e80fb37cbdacdd");
    }

    #[test]
    fn rc4_segment_boundary_matches_js() {
        // keystream bytes 999_990..1_000_020 produced by a single continuous run
        let mut e = FlowEnc::new("test-password", Alg::Rc4Md5, 12345).unwrap();
        let mut big = vec![0u8; 1_000_020];
        e.process(&mut big);
        assert_eq!(hex::encode(&big[999_990..]), "668b95c61255018d1b52085cca8b15924119b99aadd9730a7a00534da9cf");
        // ... and by seeking straight to 999_990
        let mut e2 = FlowEnc::new("test-password", Alg::Rc4Md5, 12345).unwrap();
        e2.set_position(999_990);
        let mut tail = vec![0u8; 30];
        e2.process(&mut tail);
        assert_eq!(hex::encode(&tail), "668b95c61255018d1b52085cca8b15924119b99aadd9730a7a00534da9cf");
    }

    #[test]
    fn rc4_rejects_zero_salt() {
        assert!(matches!(FlowEnc::new("x", Alg::Rc4Md5, 0), Err(FlowEncError::NullSalt)));
    }

    #[test]
    fn roundtrip() {
        for alg in [Alg::AesCtr, Alg::Rc4Md5] {
            let mut enc = FlowEnc::new("pw", alg, 4242).unwrap();
            let mut dec = FlowEnc::new("pw", alg, 4242).unwrap();
            let original: Vec<u8> = (0..5000).map(|i| (i * 7 % 251) as u8).collect();
            let mut data = original.clone();
            enc.process(&mut data);
            assert_ne!(data, original);
            dec.process(&mut data);
            assert_eq!(data, original);
        }
    }
}
