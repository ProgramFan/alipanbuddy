import CryptoJS from 'crypto-js'
import { flowencBytes, type FlowEncAlg } from '../../tauri/flowenc'

const cachePasswdOutward: { [key: string]: string } = {}

/** hex(PBKDF2-SHA256(password, salt, 1000 iterations, 16 bytes)) - identical to the former `crypto.pbkdf2Sync(...).toString('hex')` */
function pbkdf2Hex(password: string, salt: string): string {
  return CryptoJS.PBKDF2(password, salt, { keySize: 128 / 32, iterations: 1000, hasher: CryptoJS.algo.SHA256 }).toString(CryptoJS.enc.Hex)
}

/**
 * Password container for the AES-CTR / RC4-MD5 flow ciphers.
 * Only `passwdOutward` (used for file name encoding) is derived in JS; the ciphers themselves run in Rust.
 */
class FlowEnc {
  public readonly password: string
  public readonly encryptType: FlowEncAlg
  public readonly sizeSalt: number
  public passwdOutward: string

  constructor(password: string, encryptType: string = 'aesctr', sizeSalt: number = 0) {
    if (encryptType === 'aesctr') {
      this.passwdOutward = password.length !== 32 ? pbkdf2Hex(password, 'AES-CTR') : ''
    } else if (encryptType === 'rc4md5') {
      if (!sizeSalt) throw new Error('salt is null')
      this.passwdOutward = password.length !== 32 ? pbkdf2Hex(password, 'RC4') : password
    } else {
      throw new Error('FlowEnc error')
    }
    this.password = password
    this.encryptType = encryptType
    this.sizeSalt = sizeSalt
    cachePasswdOutward[password + encryptType] = this.passwdOutward
  }

  /** 加密buff (whole buffer, positioned at offset 0) */
  encryptBuff(data: Uint8Array | Buffer): Promise<Uint8Array> {
    return flowencBytes(this.encryptType, this.password, this.sizeSalt, data)
  }

  /** 解密buff (whole buffer, positioned at offset 0) */
  decryptBuff(data: Uint8Array | Buffer): Promise<Uint8Array> {
    return flowencBytes(this.encryptType, this.password, this.sizeSalt, data)
  }

  static getPassWdOutward(password: string, encryptType: string): string {
    const passwdOutward = cachePasswdOutward[password + encryptType]
    if (passwdOutward) {
      return passwdOutward
    }
    const flowEnc = new FlowEnc(password, encryptType, 1)
    return flowEnc.passwdOutward
  }
}

export default FlowEnc
