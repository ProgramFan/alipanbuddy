import { beforeEach, expect, it, vi } from 'vitest'

const settingState = {
  debugProxyHost: '127.0.0.1',
  debugProxyPort: '6666',
  securityEncType: 'aesctr',
  securityPassword: 'stored-secret',
  securityFileNameAutoDecrypt: true,
  securityPreviewAutoDecrypt: true
}
const ApiFileDownloadUrl = vi.fn()

vi.mock('../../store', () => ({ useSettingStore: () => settingState }))
vi.mock('../../module/flow-enc/utils', () => ({ decodeName: () => 'decoded-pass' }))
vi.mock('../aria2c', () => ({ localPwd: 'S4znWTaZYQi3cpRNb' }))
vi.mock('../../tauri/invoke', () => ({ invoke: vi.fn(), isTauri: () => false }))
vi.mock('../../aliapi/file', () => ({ default: { ApiFileDownloadUrl: (...args: any[]) => ApiFileDownloadUrl(...args) } }))

const WMA_URL = "https://cdn.example.com/song.wma?response-content-disposition=attachment%3B%20filename%2A%3DUTF-8%27%27song.wma&x-oss-expires=1"

beforeEach(() => {
  ApiFileDownloadUrl.mockReset()
  ApiFileDownloadUrl.mockResolvedValue({ url: WMA_URL, size: 4096 })
})

it('does not reject WMA raw download urls as preview-only audio', async () => {
  const { getRawUrl } = await import('../proxyhelper')
  const raw = await getRawUrl('u1', 'd1', 'f1')
  expect(typeof raw).toBe('object')
  expect((raw as any).url).toBe(WMA_URL)
  expect((raw as any).size).toBe(4096)
})

it('still routes encrypted WMA files through the decrypting proxy instead of refusing them', async () => {
  const { getRawUrl, getUrlFileName } = await import('../proxyhelper')
  const raw = await getRawUrl('u1', 'd1', 'f1', 'xbyEncrypt1')
  expect(typeof raw).toBe('object')
  const url = new URL((raw as any).url)
  expect(url.pathname).toBe('/proxy')
  expect(url.searchParams.get('proxy_url')).toBe(WMA_URL)
  expect(url.searchParams.get('encType')).toBe('xbyEncrypt1')
  expect(getUrlFileName(WMA_URL)).toBe('song.wma')
})
