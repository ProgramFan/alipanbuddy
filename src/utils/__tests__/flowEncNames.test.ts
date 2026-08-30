import { describe, expect, it } from 'vitest'
import FlowEnc from '../../module/flow-enc'
import { decodeName, encodeName } from '../../module/flow-enc/utils'

// Known-answer vectors generated with the original Node `crypto` implementation.
const vectors: { password: string; encType: string; plain: string; encoded: string }[] = [
  { password: 'test-password', encType: 'aesctr', plain: 'hello 世界.txt', encoded: 'PA9eoALj8YM6886vY3Ks~cVVP' },
  { password: 'test-password', encType: 'rc4md5', plain: 'hello 世界.txt', encoded: 'Z4B0O4cqjp71jj1up~zdnkYYZ' },
  { password: '0123456789abcdef0123456789abcdef', encType: 'aesctr', plain: 'report.pdf', encoded: '1Uh47ARkdoWviX55p' },
  { password: '0123456789abcdef0123456789abcdef', encType: 'rc4md5', plain: 'report.pdf', encoded: 'knSDOj1Q9-BHhXddI' }
]

describe('FlowEnc.getPassWdOutward', () => {
  it('derives the outward password with PBKDF2-SHA256 exactly like the Node implementation', () => {
    expect(FlowEnc.getPassWdOutward('test-password', 'aesctr')).toBe('9e27d51469aea3266edf77f2b0f691e8')
    expect(FlowEnc.getPassWdOutward('test-password', 'rc4md5')).toBe('3123f158ef31d9039873268bf49d944d')
  })

  it('passes 32 character passwords through', () => {
    expect(FlowEnc.getPassWdOutward('0123456789abcdef0123456789abcdef', 'aesctr')).toBe('')
    expect(FlowEnc.getPassWdOutward('0123456789abcdef0123456789abcdef', 'rc4md5')).toBe('0123456789abcdef0123456789abcdef')
  })

  it('rejects unsupported cipher types', () => {
    expect(() => new FlowEnc('test-password', 'mix', 1)).toThrow('FlowEnc error')
    expect(() => new FlowEnc('test-password', 'cha20', 1)).toThrow('FlowEnc error')
    expect(() => new FlowEnc('test-password', 'rc4md5', 0)).toThrow('salt is null')
  })
})

describe('encodeName / decodeName', () => {
  for (const v of vectors) {
    it(`encodes "${v.plain}" with ${v.encType} (${v.password.length} char password)`, () => {
      expect(encodeName(v.password, v.encType, v.plain)).toBe(v.encoded)
    })

    it(`decodes "${v.encoded}" with ${v.encType} (${v.password.length} char password)`, () => {
      expect(decodeName(v.password, v.encType, v.encoded)).toBe(v.plain)
    })
  }

  it('returns null when the crc6 check fails', () => {
    expect(decodeName('test-password', 'aesctr', 'zzzz')).toBeNull()
  })
})
