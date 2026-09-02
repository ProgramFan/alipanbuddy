/**
 * The single aria2 JSON-RPC layer: a minimal WebSocket transport with HTTP fallback, the typed
 * method wrappers and the helpers that interpret aria2 replies. Every `aria2.*` method name used
 * by the renderer is defined in `AriaCalls` below — callers pass those descriptors to
 * `client.call()` / `client.multicall()` instead of writing method names themselves.
 * Works in the Tauri webview (no Node globals).
 */
import axios from '../axios'

type Listener = (...args: any[]) => void

export interface Aria2ClientOptions {
  host: string
  port: number
  secure?: boolean
  secret?: string
  path?: string
  /** timeout (ms) of the HTTP fallback request, default 30000 */
  timeout?: number
}

/** One JSON-RPC call. `result` is never assigned, it only carries the reply type. */
export interface AriaCall<T = any> {
  method: string
  params: any[]
  result?: T
}

const rpc = <T>(method: string, ...params: any[]): AriaCall<T> => ({ method, params })

/** The typed aria2 method wrappers — the only place `aria2.*` method names are written. */
export const AriaCalls = {
  addUri: (uris: string[], options: Record<string, any>) => rpc<string>('aria2.addUri', uris, options),
  tellStatus: (gid: string, keys: readonly string[]) => rpc<any>('aria2.tellStatus', gid, [...keys]),
  tellActive: (keys: readonly string[]) => rpc<any[]>('aria2.tellActive', [...keys]),
  tellWaiting: (offset: number, num: number, keys: readonly string[]) => rpc<any[]>('aria2.tellWaiting', offset, num, [...keys]),
  tellStopped: (offset: number, num: number, keys: readonly string[]) => rpc<any[]>('aria2.tellStopped', offset, num, [...keys]),
  getFiles: (gid: string) => rpc<any[]>('aria2.getFiles', gid),
  forcePause: (gid: string) => rpc<string>('aria2.forcePause', gid),
  unpause: (gid: string) => rpc<string>('aria2.unpause', gid),
  forceRemove: (gid: string) => rpc<string>('aria2.forceRemove', gid),
  removeDownloadResult: (gid: string) => rpc<string>('aria2.removeDownloadResult', gid),
  changeGlobalOption: (options: Record<string, string>) => rpc<string>('aria2.changeGlobalOption', options),
  getGlobalStat: () => rpc<Record<string, string>>('aria2.getGlobalStat'),
  forceShutdown: () => rpc<string>('aria2.forceShutdown')
}

export class Aria2RpcError extends Error {
  code: number | string | undefined
  data: any

  constructor(error: { message?: string; code?: number | string; data?: any }) {
    super(error?.message || 'aria2 rpc error')
    this.name = 'Aria2RpcError'
    this.code = error?.code
    this.data = error?.data
  }
}

export class Aria2Client {
  host: string
  port: number
  secure: boolean
  secret: string
  path: string
  timeout: number
  private socket: WebSocket | undefined
  private lastId = 0
  private deferreds = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>()
  private listeners = new Map<string, Set<Listener>>()

  constructor(options: Aria2ClientOptions) {
    this.host = options.host || '127.0.0.1'
    this.port = options.port || 6800
    this.secure = !!options.secure
    this.secret = options.secret || ''
    this.path = options.path || '/jsonrpc'
    this.timeout = options.timeout || 30000
  }

  on(event: string, listener: Listener): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(listener)
    return this
  }

  off(event: string, listener: Listener): this {
    this.listeners.get(event)?.delete(listener)
    return this
  }

  removeAllListeners(event?: string): this {
    if (event) this.listeners.delete(event)
    else this.listeners.clear()
    return this
  }

  setMaxListeners(_n: number): this {
    return this
  }

  emit(event: string, ...args: any[]): boolean {
    const set = this.listeners.get(event)
    if (!set || set.size === 0) return false
    for (const fn of Array.from(set)) {
      try {
        fn(...args)
      } catch (err) {
        console.error('aria2 listener error', err)
      }
    }
    return true
  }

  url(protocol: 'ws' | 'http'): string {
    return protocol + (this.secure ? 's' : '') + '://' + this.host + ':' + this.port + this.path
  }

  get isOpen(): boolean {
    return !!this.socket && this.socket.readyState === WebSocket.OPEN
  }

  private withSecret(params: any[]): any[] {
    return this.secret ? ['token:' + this.secret, ...params] : [...params]
  }

  private buildMessage(method: string, params: any[]) {
    return { jsonrpc: '2.0', id: this.lastId++, method, params }
  }

  private handleMessage(data: any) {
    if (Array.isArray(data)) {
      for (const item of data) this.handleObject(item)
    } else if (data && typeof data === 'object') {
      this.handleObject(data)
    }
  }

  private handleObject(msg: any) {
    if (msg.method !== undefined && msg.id === undefined) {
      const params = msg.params
      this.emit(msg.method, params)
      const short = String(msg.method).split('aria2.')[1]
      if (short) this.emit(short, params)
      return
    }
    const deferred = this.deferreds.get(msg.id)
    if (!deferred) return
    this.deferreds.delete(msg.id)
    if (msg.error) deferred.reject(new Aria2RpcError(msg.error))
    else deferred.resolve(msg.result)
  }

  private async send(message: any): Promise<any> {
    const id = message.id
    const promise = new Promise<any>((resolve, reject) => this.deferreds.set(id, { resolve, reject }))
    if (this.isOpen) {
      try {
        this.socket!.send(JSON.stringify(message))
      } catch (err) {
        this.deferreds.delete(id)
        throw err
      }
      return promise
    }
    // HTTP fallback (also used before the socket is open)
    try {
      const resp = await axios.post(this.url('http'), message, { responseType: 'json', timeout: this.timeout, headers: { Accept: 'application/json', 'Content-Type': 'application/json' } })
      this.handleMessage(resp.data)
    } catch (err: any) {
      this.deferreds.delete(id)
      const body = err?.response?.data
      if (body && body.error) throw new Aria2RpcError(body.error)
      throw err
    }
    return promise
  }

  /** Run one typed call from `AriaCalls`. Rejects with `Aria2RpcError` on an aria2 error reply. */
  call<T>(call: AriaCall<T>): Promise<T> {
    return this.send(this.buildMessage(call.method, this.withSecret(call.params)))
  }

  /** Run several typed calls in one `system.multicall` round trip. */
  multicall(calls: AriaCall[]): Promise<any[]> {
    const methods = calls.map((item) => ({ methodName: item.method, params: this.withSecret(item.params) }))
    return this.send(this.buildMessage('system.multicall', [methods]))
  }

  open(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false
      let socket: WebSocket
      try {
        socket = new WebSocket(this.url('ws'))
      } catch (err) {
        reject(err)
        return
      }
      this.socket = socket
      socket.onopen = (...args: any[]) => {
        settled = true
        this.emit('open', ...args)
        resolve()
      }
      socket.onmessage = (ev: MessageEvent) => {
        let data: any
        try {
          data = JSON.parse(ev.data)
        } catch (err) {
          this.emit('error', err)
          return
        }
        this.handleMessage(data)
      }
      socket.onerror = (...args: any[]) => {
        this.emit('error', ...args)
        if (!settled) {
          settled = true
          reject(new Error('WebSocket 连接错误'))
        }
      }
      socket.onclose = (...args: any[]) => {
        if (this.socket === socket) this.socket = undefined
        for (const [id, d] of this.deferreds) {
          d.reject(new Error('aria2 connection closed'))
          this.deferreds.delete(id)
        }
        this.emit('close', ...args)
        if (!settled) {
          settled = true
          reject(new Error('WebSocket 已关闭'))
        }
      }
    })
  }

  close(): Promise<void> {
    return new Promise<void>((resolve) => {
      const socket = this.socket
      if (!socket) {
        resolve()
        return
      }
      const done = () => resolve()
      socket.addEventListener('close', done, { once: true })
      try {
        socket.close()
      } catch {
        resolve()
      }
      setTimeout(done, 1000)
    })
  }
}

export interface BuildAriaAddOptionsInput {
  gid: string
  dir: string
  split: number
  referer: string
  userAgent: string
  headers: string[]
  outFileName: string
}

/** Build the option map handed to `AriaCalls.addUri` */
export const buildAriaAddOptions = (input: BuildAriaAddOptionsInput): Record<string, any> => {
  const options: Record<string, any> = {
    gid: input.gid,
    dir: input.dir,
    split: input.split,
    out: input.outFileName
  }
  if (input.referer) options.referer = input.referer
  if (input.userAgent) options['user-agent'] = input.userAgent
  if (input.headers.length) options.header = input.headers
  return options
}

/** Run an aria2 call without letting a rejection escape, optionally handing the error to the caller */
export const tryAriaCall = async <T>(run: () => Promise<T>, onError?: (error: unknown) => void): Promise<T | undefined> => {
  try {
    return await run()
  } catch (error) {
    onError?.(error)
    return undefined
  }
}

/** aria2 answers addUri with a gid, wrapped in one or two arrays when it comes from a multicall */
export const getAriaAddUriGid = (result: unknown): string => {
  if (Array.isArray(result)) {
    for (const item of result) {
      const gid = getAriaAddUriGid(item)
      if (gid) return gid
    }
    return ''
  }
  if (typeof result === 'string') return result.trim()
  return ''
}

export const isAriaDuplicateGidError = (error: unknown): boolean => {
  const message = typeof error === 'object' && error && 'message' in error
    ? String((error as { message?: unknown }).message || '')
    : typeof error === 'string'
      ? error
      : ''
  return /\bgid\b/i.test(message) && /already exists/i.test(message)
}

export const ariaErrorMessage = (error: unknown): string => {
  if (typeof error === 'object' && error && 'message' in error) return String((error as { message?: unknown }).message || '')
  return ''
}

export const shouldRemoveAriaStoppedResult = (status: string): boolean => {
  return status === 'error' || status === 'removed'
}
