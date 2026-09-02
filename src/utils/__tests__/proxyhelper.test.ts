import { beforeEach, describe, expect, it, vi } from 'vitest'

const settingState = {
  debugProxyHost: '127.0.0.1',
  debugProxyPort: '6666',
  securityEncType: 'aesctr',
  securityPassword: 'stored-secret',
  securityFileNameAutoDecrypt: true,
  securityPreviewAutoDecrypt: true
}

const decodeName = vi.fn((_password: string, _encType: string, _name: string): string | null => 'decoded-pass')
const invoke = vi.fn(async (cmd: string) => (cmd === 'get_local_ip' ? '192.168.1.8' : undefined))
const ApiFileDownloadUrl = vi.fn()

vi.mock('../../store', () => ({ useSettingStore: () => settingState }))
vi.mock('../../module/flow-enc/utils', () => ({ decodeName: (...args: any[]) => decodeName(args[0], args[1], args[2]) }))
vi.mock('../../download/aria2c', () => ({ localPwd: 'S4znWTaZYQi3cpRNb' }))
vi.mock('../../tauri/invoke', () => ({ invoke: (...args: any[]) => invoke(args[0]), isTauri: () => false }))
vi.mock('../../aliapi/file', () => ({ default: { ApiFileDownloadUrl: (...args: any[]) => ApiFileDownloadUrl(...args) } }))

const query = (url: string) => new URL(url).searchParams

beforeEach(() => {
  settingState.debugProxyHost = '127.0.0.1'
  settingState.debugProxyPort = '6666'
  settingState.securityEncType = 'aesctr'
  settingState.securityFileNameAutoDecrypt = true
  settingState.securityPreviewAutoDecrypt = true
  decodeName.mockClear()
})

describe('getProxyUrl', () => {

  it('builds a plain proxy url without decryption parameters', async () => {
    const { getProxyUrl } = await import('../proxyhelper')
    const url = getProxyUrl({ user_id: 'u1', drive_id: 'd1', file_id: 'f1', file_size: 1024, proxy_url: 'https://cdn.example.com/a.mp4?x-oss-expires=1' })
    expect(url.startsWith('http://127.0.0.1:6666/proxy?')).toBe(true)
    const params = query(url)
    expect(params.get('user_id')).toBe('u1')
    expect(params.get('drive_id')).toBe('d1')
    expect(params.get('file_id')).toBe('f1')
    expect(params.get('file_size')).toBe('1024')
    expect(params.get('proxy_url')).toBe('https://cdn.example.com/a.mp4?x-oss-expires=1')
    expect(params.has('encType')).toBe(false)
    expect(params.has('enc_alg')).toBe(false)
    expect(params.has('enc_password')).toBe(false)
    expect(params.has('decrypt_name')).toBe(false)
  })

  it('drops empty values and encodes keys and values', async () => {
    const { getProxyUrl } = await import('../proxyhelper')
    const url = getProxyUrl({ user_id: 'u1', file_id: '', encType: undefined, file_name: 'a b&c.mp4' })
    const params = query(url)
    expect(params.has('file_id')).toBe(false)
    expect(params.has('encType')).toBe(false)
    expect(params.get('file_name')).toBe('a b&c.mp4')
    expect(url).toContain('file_name=a%20b%26c.mp4')
  })

  it('appends enc_alg, the resolved enc_password and decrypt_name for xbyEncrypt1 files', async () => {
    const { getProxyUrl } = await import('../proxyhelper')
    const url = getProxyUrl({ user_id: 'u1', drive_id: 'd1', file_id: 'f1', encType: 'xbyEncrypt1', file_size: 10, proxy_url: 'https://cdn.example.com/enc.bin' })
    const params = query(url)
    expect(params.get('encType')).toBe('xbyEncrypt1')
    expect(params.get('enc_alg')).toBe('aesctr')
    expect(params.get('enc_password')).toBe('decoded-pass')
    expect(params.get('decrypt_name')).toBe('1')
    expect(decodeName).toHaveBeenCalledWith('S4znWTaZYQi3cpRNb', 'aesctr', 'stored-secret')
  })

  it('uses the user id as password for xbyEncrypt2 and honours the configured algorithm', async () => {
    settingState.securityEncType = 'rc4md5'
    const { getProxyUrl } = await import('../proxyhelper')
    const params = query(getProxyUrl({ user_id: 'user-2', encType: 'xbyEncrypt2' }))
    expect(params.get('enc_alg')).toBe('rc4md5')
    expect(params.get('enc_password')).toBe('user-2')
    expect(decodeName).not.toHaveBeenCalled()
  })

  it('prefers an explicit password and omits decrypt_name when file name decryption is disabled', async () => {
    settingState.securityFileNameAutoDecrypt = false
    const { getProxyUrl } = await import('../proxyhelper')
    const params = query(getProxyUrl({ user_id: 'u1', encType: 'xbyEncrypt1', password: 'typed' }))
    expect(params.get('password')).toBe('typed')
    expect(params.get('enc_password')).toBe('typed')
    expect(params.has('decrypt_name')).toBe(false)
  })

  it('targets the configured proxy host and port', async () => {
    settingState.debugProxyHost = '192.168.1.8'
    settingState.debugProxyPort = '4961'
    const { getProxyUrl } = await import('../proxyhelper')
    expect(getProxyUrl({ user_id: 'u1' }).startsWith('http://192.168.1.8:4961/proxy?')).toBe(true)
  })
})

describe('getEncType / getEncPassword', () => {
  it('detects the encryption flavour from the file description', async () => {
    const { getEncType } = await import('../proxyhelper')
    expect(getEncType({ description: 'xbyEncrypt1' })).toBe('xbyEncrypt1')
    expect(getEncType({ description: 'foo xbyEncrypt2 bar' })).toBe('xbyEncrypt2')
    expect(getEncType({ description: '' })).toBe('')
  })

  it('falls back to the user id key when the stored password cannot be decoded', async () => {
    decodeName.mockImplementationOnce(() => null).mockImplementationOnce(() => 'by-user')
    const { getEncPassword } = await import('../proxyhelper')
    expect(getEncPassword('u9', 'xbyEncrypt1')).toBe('by-user')
    expect(decodeName).toHaveBeenLastCalledWith('u9', 'aesctr', 'stored-secret')
    expect(getEncPassword('u9', '')).toBe('')
  })
})

describe('getRawUrl', () => {
  beforeEach(() => {
    ApiFileDownloadUrl.mockReset()
  })

  it('returns the raw download url for plain files and the api error string as-is', async () => {
    const { getRawUrl } = await import('../proxyhelper')
    ApiFileDownloadUrl.mockResolvedValueOnce({ url: 'https://cdn.example.com/raw.mp4', size: 99, headers: { Referer: 'https://www.alipan.com/' } })
    const raw = await getRawUrl('u1', 'd1', 'f1')
    expect(raw).toEqual({ drive_id: 'd1', file_id: 'f1', url: 'https://cdn.example.com/raw.mp4', size: 99, headers: { Referer: 'https://www.alipan.com/' } })
    expect(ApiFileDownloadUrl).toHaveBeenCalledWith('u1', 'd1', 'f1', 14400)

    ApiFileDownloadUrl.mockResolvedValueOnce('文件已被删除')
    expect(await getRawUrl('u1', 'd1', 'f1')).toBe('文件已被删除')
  })

  it('routes encrypted files through the local proxy only when preview decryption is enabled', async () => {
    const { getRawUrl } = await import('../proxyhelper')
    ApiFileDownloadUrl.mockResolvedValue({ url: 'https://cdn.example.com/enc.bin', size: 7 })
    const proxied = await getRawUrl('u1', 'd1', 'f1', 'xbyEncrypt1')
    expect(typeof proxied).toBe('object')
    const params = query((proxied as any).url)
    expect((proxied as any).url.startsWith('http://127.0.0.1:6666/proxy?')).toBe(true)
    expect(params.get('proxy_url')).toBe('https://cdn.example.com/enc.bin')
    expect(params.get('file_size')).toBe('7')
    expect(params.get('enc_alg')).toBe('aesctr')
    expect(params.get('enc_password')).toBe('decoded-pass')

    settingState.securityPreviewAutoDecrypt = false
    const raw = await getRawUrl('u1', 'd1', 'f1', 'xbyEncrypt1')
    expect((raw as any).url).toBe('https://cdn.example.com/enc.bin')
  })
})

describe('getLocalIp', () => {
  it('asks the backend for the LAN address and falls back to loopback', async () => {
    const { getLocalIp } = await import('../proxyhelper')
    expect(await getLocalIp()).toBe('192.168.1.8')
    expect(invoke).toHaveBeenCalledWith('get_local_ip')
    invoke.mockRejectedValueOnce(new Error('no network'))
    expect(await getLocalIp()).toBe('127.0.0.1')
  })
})
