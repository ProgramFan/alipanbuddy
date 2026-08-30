//! File name obfuscation compatible with `src/module/flow-enc/utils.ts` (`encodeName`/`decodeName`):
//! a base64 variant with a password-derived alphabet plus a 6 bit CRC check character.

use std::collections::HashMap;

use sha2::{Digest, Sha256};

use crate::flowenc::{passwd_outward, Alg};

const SOURCE: &str = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-~+";

fn source_chars() -> Vec<char> {
    SOURCE.chars().collect()
}

fn crc6_table() -> [u8; 256] {
    let mut table = [0u8; 256];
    for (i, slot) in table.iter_mut().enumerate() {
        let mut curr = i as u32;
        for _ in 0..8 {
            curr = if curr & 1 != 0 { ((curr >> 1) ^ 0x30) % 256 } else { (curr >> 1) % 256 };
        }
        *slot = curr as u8;
    }
    table
}

pub fn crc6(bytes: &[u8]) -> u8 {
    let table = crc6_table();
    let mut c: u8 = 0;
    for b in bytes {
        c = table[(c ^ b) as usize];
    }
    c
}

pub struct MixBase64 {
    chars: Vec<char>,
    map: HashMap<char, usize>,
}

impl MixBase64 {
    pub fn new(passwd: &str) -> Self {
        MixBase64::with_salt(passwd, "mix64")
    }

    pub fn with_salt(passwd: &str, salt: &str) -> Self {
        let chars: Vec<char> = if passwd.chars().count() == 64 {
            passwd.chars().collect()
        } else {
            MixBase64::init_ksa(&format!("{passwd}{salt}"))
        };
        let map = chars.iter().enumerate().map(|(i, c)| (*c, i)).collect();
        MixBase64 { chars, map }
    }

    fn init_ksa(passwd: &str) -> Vec<char> {
        let key: [u8; 32] = Sha256::digest(passwd.as_bytes()).into();
        let source = source_chars();
        let n = source.len();
        let mut sbox: Vec<usize> = (0..n).collect();
        let mut j = 0usize;
        for i in 0..n {
            j = (j + sbox[i] + key[i % key.len()] as usize) % n;
            sbox.swap(i, j);
        }
        sbox.into_iter().map(|i| source[i]).collect()
    }

    pub fn encode(&self, buffer: &[u8]) -> String {
        let c = &self.chars;
        let mut result = String::new();
        let mut chunks = buffer.chunks_exact(3);
        for bt in &mut chunks {
            result.push(c[(bt[0] >> 2) as usize]);
            result.push(c[(((bt[0] & 3) << 4) | (bt[1] >> 4)) as usize]);
            result.push(c[(((bt[1] & 15) << 2) | (bt[2] >> 6)) as usize]);
            result.push(c[(bt[2] & 63) as usize]);
        }
        let rem = chunks.remainder();
        match rem.len() {
            1 => {
                result.push(c[(rem[0] >> 2) as usize]);
                result.push(c[((rem[0] & 3) << 4) as usize]);
                result.push(c[64]);
                result.push(c[64]);
            }
            2 => {
                result.push(c[(rem[0] >> 2) as usize]);
                result.push(c[(((rem[0] & 3) << 4) | (rem[1] >> 4)) as usize]);
                result.push(c[((rem[1] & 15) << 2) as usize]);
                result.push(c[64]);
            }
            _ => {}
        }
        result
    }

    pub fn decode(&self, text: &str) -> Option<Vec<u8>> {
        let chars: Vec<char> = text.chars().collect();
        let pad = self.chars[64];
        let mut size = chars.len() / 4 * 3;
        let double_pad: String = [pad, pad].iter().collect();
        if text.contains(&double_pad) {
            size = size.saturating_sub(2);
        } else if text.contains(pad) {
            size = size.saturating_sub(1);
        }
        let mut out = Vec::with_capacity(size);
        let mut i = 0;
        while i < chars.len() {
            let next = |idx: usize| -> Option<usize> { chars.get(idx).and_then(|ch| self.map.get(ch)).copied() };
            let enc1 = next(i)?;
            let enc2 = next(i + 1)?;
            let enc3 = next(i + 2)?;
            let enc4 = next(i + 3)?;
            i += 4;
            out.push((((enc1 << 2) | (enc2 >> 4)) & 0xff) as u8);
            if enc3 != 64 {
                out.push(((((enc2 & 15) << 4) | (enc3 >> 2)) & 0xff) as u8);
            }
            if enc4 != 64 {
                out.push(((((enc3 & 3) << 6) | enc4) & 0xff) as u8);
            }
            if out.len() > size {
                return None;
            }
        }
        Some(out)
    }

    pub fn source_char(index: usize) -> Option<char> {
        SOURCE.chars().nth(index)
    }
}

/// `encodeName(password, encType, plainName)`
pub fn encode_name(password: &str, alg: Alg, plain: &str) -> String {
    let outward = passwd_outward(password, alg);
    let mix = MixBase64::new(&outward);
    let mut encoded = mix.encode(plain.as_bytes());
    let check = crc6(format!("{encoded}{outward}").as_bytes());
    encoded.push(MixBase64::source_char(check as usize).unwrap_or('A'));
    encoded
}

/// `decodeName(password, encType, encodeName)` - `None` when the checksum or the base64 payload is invalid.
pub fn decode_name(password: &str, alg: Alg, encoded: &str) -> Option<String> {
    let mut chars = encoded.chars();
    let check_char = chars.next_back()?;
    let sub: String = chars.collect();
    let outward = passwd_outward(password, alg);
    let mix = MixBase64::new(&outward);
    let check = crc6(format!("{sub}{outward}").as_bytes());
    if MixBase64::source_char(check as usize) != Some(check_char) {
        return None;
    }
    let bytes = mix.decode(&sub)?;
    Some(String::from_utf8_lossy(&bytes).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_matches_js() {
        assert_eq!(encode_name("test-password", Alg::AesCtr, "hello 世界.txt"), "PA9eoALj8YM6886vY3Ks~cVVP");
        assert_eq!(encode_name("test-password", Alg::Rc4Md5, "hello 世界.txt"), "Z4B0O4cqjp71jj1up~zdnkYYZ");
        assert_eq!(encode_name("0123456789abcdef0123456789abcdef", Alg::AesCtr, "report.pdf"), "1Uh47ARkdoWviX55p");
        assert_eq!(encode_name("0123456789abcdef0123456789abcdef", Alg::Rc4Md5, "report.pdf"), "knSDOj1Q9-BHhXddI");
    }

    #[test]
    fn decode_matches_js() {
        assert_eq!(decode_name("test-password", Alg::AesCtr, "PA9eoALj8YM6886vY3Ks~cVVP").as_deref(), Some("hello 世界.txt"));
        assert_eq!(decode_name("test-password", Alg::Rc4Md5, "Z4B0O4cqjp71jj1up~zdnkYYZ").as_deref(), Some("hello 世界.txt"));
        assert_eq!(decode_name("0123456789abcdef0123456789abcdef", Alg::Rc4Md5, "knSDOj1Q9-BHhXddI").as_deref(), Some("report.pdf"));
        assert_eq!(decode_name("test-password", Alg::AesCtr, "zzzz"), None);
        assert_eq!(decode_name("other", Alg::AesCtr, "PA9eoALj8YM6886vY3Ks~cVVP"), None);
    }

    #[test]
    fn roundtrip_various_lengths() {
        for name in ["a", "ab", "abc", "abcd", "文件夹/名字.mkv", ""] {
            let enc = encode_name("pw", Alg::AesCtr, name);
            assert_eq!(decode_name("pw", Alg::AesCtr, &enc).as_deref(), Some(name), "{name}");
        }
    }
}
