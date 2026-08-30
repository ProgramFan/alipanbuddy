import CryptoJS from 'crypto-js'

/** Converts raw bytes into a crypto-js WordArray (big-endian packing, like `CryptoJS.lib.WordArray.create(typedArray)`). */
export function bytesToWordArray(bytes: Uint8Array): CryptoJS.lib.WordArray {
  const words: number[] = []
  for (let i = 0; i < bytes.length; i++) {
    words[i >>> 2] |= bytes[i] << (24 - (i % 4) * 8)
  }
  return CryptoJS.lib.WordArray.create(words, bytes.length)
}

/** Converts a crypto-js WordArray (e.g. a digest) back into raw bytes. */
export function wordArrayToBytes(wordArray: CryptoJS.lib.WordArray): Uint8Array {
  const bytes = new Uint8Array(wordArray.sigBytes)
  for (let i = 0; i < wordArray.sigBytes; i++) {
    bytes[i] = (wordArray.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff
  }
  return bytes
}
