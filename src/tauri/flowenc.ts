/** Thin wrappers around the Rust `flowenc_*` commands (streaming AES-CTR / RC4-MD5 now live in Rust). */
import { invoke } from './invoke'
import { fromBase64, toBase64 } from './fs'

export type FlowEncAlg = 'aesctr' | 'rc4md5'

/** Symmetric in-memory encrypt/decrypt (the ciphers are their own inverse) positioned at offset 0. */
export async function flowencBytes(alg: FlowEncAlg, password: string, sizeSalt: number, data: Uint8Array | ArrayBuffer | string): Promise<Uint8Array> {
  const base64 = await invoke<string>('flowenc_bytes', { alg, password, sizeSalt, base64: toBase64(data) })
  return fromBase64(base64)
}

/** Encrypts/decrypts a whole file `src` → `dst`; resolves with the number of bytes written. */
export function flowencFile(alg: FlowEncAlg, password: string, src: string, dst: string): Promise<number> {
  return invoke<number>('flowenc_file', { alg, password, src, dst })
}
