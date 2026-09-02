/**
 * Minimal aria2 JSON-RPC client (WebSocket with HTTP fallback) with the subset of the
 * `aria2-lib` API this app uses. Works in the Tauri webview (no Node globals).
 */
import axios from '../axios'

type Listener = (...args: any[]) => void

export interface Aria2ClientOptions {
  host: string
  port: number
  secure?: boolean
  secret?: string
  path?: string
}

class Aria2RpcError extends Error {
  code: number | string | undefined
  data: any

  constructor(error: { message?: string; code?: number | string; data?: any }) {
    super(error?.message || 'aria2 rpc error')
    this.name = 'Aria2RpcError'
    this.code = error?.code
    this.data = error?.data
  }
}

export default class Aria2Client {
  host: string
  port: number
  secure: boolean
  secret: string
  path: string
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

  private prefix(method: string): string {
    if (method.startsWith('system.') || method.startsWith('aria2.')) return method
    return 'aria2.' + method
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
      const resp = await axios.post(this.url('http'), message, { responseType: 'json', timeout: 30000, headers: { Accept: 'application/json', 'Content-Type': 'application/json' } })
      this.handleMessage(resp.data)
    } catch (err: any) {
      this.deferreds.delete(id)
      const body = err?.response?.data
      if (body && body.error) throw new Aria2RpcError(body.error)
      throw err
    }
    return promise
  }

  call(method: string, ...params: any[]): Promise<any> {
    return this.send(this.buildMessage(this.prefix(method), this.withSecret(params)))
  }

  multicall(calls: any[][]): Promise<any> {
    const methods = calls.map(([method, ...params]) => ({ methodName: this.prefix(method), params: this.withSecret(params) }))
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
