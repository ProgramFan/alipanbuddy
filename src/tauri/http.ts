/**
 * axios adapter that sends every request through the Rust `http_request` command (pooled reqwest
 * client, see src-tauri/src/commands/http.rs). The webview's own `fetch`/XHR cannot talk to Aliyun because of CORS
 * and forbidden headers; Electron used to inject `Origin`/`Referer`/`User-Agent` in the main
 * process (`launch.ts#onBeforeSendHeaders`) - the same rules live in `injectAliyunHeaders`.
 */
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { AxiosError, AxiosHeaders } from 'axios'
import buildURL from 'axios/unsafe/helpers/buildURL.js'
import buildFullPath from 'axios/unsafe/core/buildFullPath.js'
import settle from 'axios/unsafe/core/settle.js'
import { getUserTokenFallback } from './state'
import { invoke } from './invoke'
import { fromBase64, toBase64 } from './fs'

interface HttpResponseOut {
  status: number
  statusText: string
  url: string
  headers: [string, string][]
  bodyBase64: string
  bodyId?: number | null
  bodyUrl?: string | null
}

const BODY_CHUNK = 512 * 1024

/** IPC fallback: the parked body in ≤512 KB base64 pieces (one huge IPC reply was unreliable on WebKitGTK). */
async function readBodyChunked(id: number): Promise<Uint8Array> {
  const parts: Uint8Array[] = []
  let offset = 0
  let total = -1
  while (total < 0 || offset < total) {
    const chunk = await invoke<{ data: string; total: number }>('http_body_chunk', { id, offset, len: BODY_CHUNK })
    total = chunk.total
    const bytes = fromBase64(chunk.data)
    if (bytes.length === 0 && offset < total) throw new Error('empty chunk at ' + offset + '/' + total)
    parts.push(bytes)
    offset += bytes.length
  }
  const out = new Uint8Array(offset)
  let pos = 0
  for (const part of parts) {
    out.set(part, pos)
    pos += part.length
  }
  return out
}

/** Large bodies are parked in the Rust loopback bridge; fetch them natively, fall back to chunked IPC. */
async function readBody(out: HttpResponseOut): Promise<Uint8Array> {
  if (out.bodyUrl && out.bodyId != null) {
    const id = out.bodyId
    let bytes: Uint8Array
    try {
      const res = await fetch(out.bodyUrl, { cache: 'no-store' })
      if (!res.ok) throw new Error('bridge status ' + res.status)
      bytes = new Uint8Array(await res.arrayBuffer())
    } catch (err: any) {
      console.warn('[http] loopback body fetch failed, using chunked IPC fallback', err?.message || err)
      bytes = await readBodyChunked(id)
    }
    invoke('http_body_release', { id }).catch(() => {})
    return bytes
  }
  return out.bodyBase64 ? fromBase64(out.bodyBase64) : new Uint8Array(0)
}

const ALIYUN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0'

function hasHeader(headers: AxiosHeaders, name: string): boolean {
  return headers.has(name) && String(headers.get(name) ?? '') !== ''
}

/** Same header rules Electron applied in `session.defaultSession.webRequest.onBeforeSendHeaders`. */
function injectAliyunHeaders(url: string, headers: AxiosHeaders) {
  const isAliPan = url.includes('.aliyundrive.com') || url.includes('.alipan.com')
  const isOpenApi = url.includes('adrive/v1.0') || url.includes('adrive/v1.1')
  const forbid = url.includes('younoyes') || url.includes('onatoshi')
  const token = getUserTokenFallback()
  if (isAliPan) {
    headers.set('Origin', 'https://www.aliyundrive.com', true)
    headers.set('X-Canary', 'client=windows,app=adrive,version=v4.12.0', true)
  }
  if (!hasHeader(headers, 'Referer')) headers.set('Referer', 'https://www.aliyundrive.com/', true)
  if (!hasHeader(headers, 'User-Agent')) headers.set('User-Agent', forbid ? 'SenPlayer' : ALIYUN_UA, true)
  if (isAliPan && url.includes('download') && !hasHeader(headers, 'Authorization') && token.access_token) {
    headers.set('Authorization', token.access_token, true)
  }
  if (isOpenApi && !hasHeader(headers, 'Authorization') && token.open_api_access_token) {
    headers.set('Authorization', 'Bearer ' + token.open_api_access_token, true)
  }
  if (!hasHeader(headers, 'Accept-Language')) headers.set('Accept-Language', 'zh-CN,zh;q=0.9', true)
}

function isBodyLike(data: any): boolean {
  return data instanceof ArrayBuffer || ArrayBuffer.isView(data) || (typeof Blob !== 'undefined' && data instanceof Blob) || (typeof FormData !== 'undefined' && data instanceof FormData) || (typeof URLSearchParams !== 'undefined' && data instanceof URLSearchParams)
}

async function encodeBody(body: any): Promise<string> {
  if (body === undefined || body === null || body === '') return ''
  if (typeof body === 'string') return toBase64(body)
  if (body instanceof ArrayBuffer) return toBase64(body)
  if (ArrayBuffer.isView(body)) return toBase64(new Uint8Array(body.buffer, body.byteOffset, body.byteLength))
  if (typeof Blob !== 'undefined' && body instanceof Blob) return toBase64(await body.arrayBuffer())
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return toBase64(body.toString())
  if (typeof FormData !== 'undefined' && body instanceof FormData) throw new Error('FormData bodies are not supported by the Tauri HTTP bridge')
  return toBase64(String(body))
}

export const tauriAxiosAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
  const fullPath = buildFullPath(config.baseURL, config.url, (config as any).allowAbsoluteUrls)
  const url: string = buildURL(fullPath, config.params, config.paramsSerializer)
  const headers = AxiosHeaders.from(config.headers).normalize(false) as AxiosHeaders
  let body: any = config.data
  if (body !== undefined && body !== null && typeof body === 'object' && !isBodyLike(body)) {
    body = JSON.stringify(body)
    if (!hasHeader(headers, 'Content-Type')) headers.setContentType('application/json', false)
  }
  if (typeof body === 'string' && !hasHeader(headers, 'Content-Type')) {
    headers.setContentType('application/json', false)
  }
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams && !hasHeader(headers, 'Content-Type')) {
    headers.setContentType('application/x-www-form-urlencoded;charset=utf-8', false)
  }
  injectAliyunHeaders(url, headers)

  const headerList: [string, string][] = []
  for (const [key, value] of Object.entries(headers.toJSON(true))) {
    if (value === undefined || value === null) continue
    headerList.push([key, Array.isArray(value) ? value.join(', ') : String(value)])
  }
  const timeout = config.timeout && config.timeout > 0 ? config.timeout : 30000
  if ((config.signal as AbortSignal | undefined)?.aborted) throw new AxiosError('canceled', AxiosError.ERR_CANCELED, config, { url })

  let out: HttpResponseOut
  try {
    out = await invoke<HttpResponseOut>('http_request', {
      request: {
        method: (config.method || 'get').toUpperCase(),
        url,
        headers: headerList,
        bodyBase64: await encodeBody(body),
        timeoutMs: timeout,
        redirect: config.maxRedirects === 0 ? 'manual' : 'follow'
      }
    })
  } catch (err: any) {
    const message: string = err?.message || String(err)
    console.warn('[http] request failed', (config.method || 'get').toUpperCase(), url, message)
    if (message.startsWith('timeout')) throw new AxiosError(`timeout of ${timeout}ms exceeded`, AxiosError.ECONNABORTED, config, { url })
    throw new AxiosError(message, AxiosError.ERR_NETWORK, config, { url })
  }

  let bytes: Uint8Array
  try {
    bytes = await readBody(out)
  } catch (err: any) {
    const message: string = err?.message || String(err)
    console.warn('[http] body transfer failed', (config.method || 'get').toUpperCase(), url, message)
    throw new AxiosError('body transfer failed: ' + message, AxiosError.ERR_NETWORK, config, { url })
  }
  const responseType = config.responseType || 'json'
  let data: any
  if (responseType === 'arraybuffer') {
    data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  } else if (responseType === 'blob') {
    const type = out.headers.find(([k]) => k.toLowerCase() === 'content-type')?.[1] || ''
    data = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type })
  } else {
    // 'json' and 'text': hand the raw text to axios' default transformResponse (mirrors the XHR adapter)
    data = new TextDecoder('utf-8').decode(bytes)
  }
  if (config.onDownloadProgress) {
    config.onDownloadProgress({ loaded: bytes.byteLength, total: bytes.byteLength, progress: 1, bytes: bytes.byteLength, lengthComputable: true } as any)
  }

  const responseHeaders: Record<string, string> = {}
  for (const [key, value] of out.headers) {
    const k = key.toLowerCase()
    responseHeaders[k] = responseHeaders[k] ? responseHeaders[k] + ', ' + value : value
  }
  const response: AxiosResponse = {
    data,
    status: out.status,
    statusText: out.statusText,
    headers: AxiosHeaders.from(responseHeaders),
    config,
    request: { url }
  }
  return new Promise((resolve, reject) => settle(resolve, reject, response))
}
