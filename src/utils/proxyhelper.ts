import { useSettingStore } from '../store'
import { decodeName } from '../module/flow-enc/utils'
import { IAliFileItem, IAliGetFileModel } from '../aliapi/alimodels'
import AliFile from '../aliapi/file'
import { localPwd } from './aria2c'
import { invoke } from '../tauri/invoke'

export interface IRawUrl {
  drive_id: string
  file_id: string
  url: string
  size: number
  headers?: Record<string, string>
}

interface FileInfo {
  user_id: string
  drive_id?: string
  file_id?: string
  file_size?: number
  encType?: string
  proxy_headers?: string

  [key: string]: string | number | undefined
}

/** LAN IPv4 address of this machine (falls back to 127.0.0.1). Answered by the Rust side. */
export async function getLocalIp(): Promise<string> {
  try {
    const ip = await invoke<string>('get_local_ip')
    return ip || '127.0.0.1'
  } catch {
    return '127.0.0.1'
  }
}

export function getEncType(file: IAliGetFileModel | IAliFileItem | { description: string }): string {
  let description = file.description
  if (description) {
    if (description.includes('xbyEncrypt1')) {
      return 'xbyEncrypt1'
    } else if (description.includes('xbyEncrypt2')) {
      return 'xbyEncrypt2'
    }
  }
  return ''
}

export function getEncPassword(user_id: string, encType: string, inputpassword: string = ''): string {
  if (encType) {
    if (inputpassword) {
      return inputpassword
    }
    let settingStore = useSettingStore()
    if (encType == 'xbyEncrypt1') {
      let ecnPassword = decodeName(localPwd, settingStore.securityEncType, settingStore.securityPassword)
      if (!ecnPassword) {
        ecnPassword = decodeName(user_id, settingStore.securityEncType, settingStore.securityPassword)
      }
      return ecnPassword || ''
    }
    return user_id
  }
  return ''
}

function buildQuery(info: FileInfo): string {
  return Object.keys(info)
    .filter((v) => info[v])
    .map((key: string) => `${encodeURIComponent(key)}=${encodeURIComponent(info[key]!!)}`)
    .join('&')
}

/**
 * Builds the local proxy url (`/proxy`). For encrypted files the resolved decryption parameters
 * (`enc_alg`, `enc_password`, `decrypt_name`) are appended so the Rust proxy can decrypt on the fly.
 */
export function getProxyUrl(info: FileInfo) {
  const settingStore = useSettingStore()
  const { debugProxyHost, debugProxyPort } = settingStore
  const proxyUrl = `http://${debugProxyHost}:${debugProxyPort}/proxy`
  const query: FileInfo = { ...info }
  if (info.encType) {
    query.enc_alg = settingStore.securityEncType
    query.enc_password = getEncPassword(String(info.user_id || ''), String(info.encType), String(info.password || ''))
    if (settingStore.securityFileNameAutoDecrypt) query.decrypt_name = '1'
  }
  return `${proxyUrl}?${buildQuery(query)}`
}

export function getRedirectUrl(info: FileInfo) {
  let { debugProxyHost, debugProxyPort } = useSettingStore()
  let redirectUrl = `http://${debugProxyHost}:${debugProxyPort}/redirect`
  return `${redirectUrl}?${buildQuery(info)}`
}

export async function getRawUrl(user_id: string, drive_id: string, file_id: string, encType: string = '', password: string = ''): Promise<string | IRawUrl> {
  const downUrl = await AliFile.ApiFileDownloadUrl(user_id, drive_id, file_id, 14400)
  if (typeof downUrl == 'string') return downUrl
  const data: IRawUrl = { drive_id, file_id, url: downUrl.url, size: downUrl.size }
  if (downUrl.headers) data.headers = downUrl.headers
  if (encType && useSettingStore().securityPreviewAutoDecrypt) {
    // 代理解密
    data.url = getProxyUrl({ user_id, drive_id, file_id, encType, password, file_size: data.size, proxy_url: downUrl.url })
  }
  return data
}

export function getUrlFileName(url: string) {
  let fileNameMatch = decodeURIComponent(url).match(/filename\*?=[^=;]*;?''([^&]+)/)
  if (fileNameMatch && fileNameMatch[1]) {
    return fileNameMatch[1]
  }
  return ''
}
