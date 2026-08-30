import { useSettingStore } from '../store'
import FlowEnc from '../module/flow-enc'
import http, { Agent as HttpAgent, IncomingMessage, Server, ServerResponse } from 'http'
import Db from './db'
import https, { Agent as HttpsAgent } from 'https'
import { GetExpiresTime } from './utils'
import { decodeName } from '../module/flow-enc/utils'
import { IAliFileItem, IAliGetFileModel } from '../aliapi/alimodels'
import AliFile from '../aliapi/file'
import path from 'path'
import { localPwd } from './aria2c'
import os from 'os'
import DebugLog from './debuglog'
import message from './message'
import { buildUpstreamProxyHeaders, ensureInlinePreviewRange, normalizeProxyRangeHeaders, normalizeProxyStatusCode, type ProxyResponseHeaders } from './proxyHeaders'
import { shouldRefreshProxyUrl } from './proxyCache'

// 默认maxFreeSockets=256
const httpsAgent = new HttpsAgent({ keepAlive: true })
const httpAgent = new HttpAgent({ keepAlive: true })

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

export function getIPAddress() {
  let ipv4 = ''
  const interfaces = os.networkInterfaces()
  for (const dev in interfaces) {
    let device = interfaces[dev]
    if (device) {
      device.forEach((details, alias) => {
        if (dev.includes('以太网') || dev == 'WLAN') {
          if (details.family == 'IPv4' && !details.internal
            && details.address.startsWith('192.168')) {
            ipv4 = details.address
            return
          }
        }
      })
    }
  }
  // console.log(ipv4)
  return ipv4 || '127.0.0.1'
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

export function getFlowEnc(user_id: string, fileSize: number, encType: string, password: string = '') {
  if (!encType) return null
  let settingStore = useSettingStore()
  const securityPassword = getEncPassword(user_id, encType, password)
  const securityEncType = settingStore.securityEncType
  return new FlowEnc(securityPassword, securityEncType, fileSize)
}

export function getProxyUrl(info: FileInfo) {
  let { debugProxyHost, debugProxyPort } = useSettingStore()
  let proxyUrl = `http://${debugProxyHost}:${debugProxyPort}/proxy`
  let params = Object.keys(info).filter(v => info[v])
    .map((key: string) => `${encodeURIComponent(key)}=${encodeURIComponent(info[key]!!)}`)
  return `${proxyUrl}?${params.join('&')}`
}

export function getRedirectUrl(info: FileInfo) {
  let { debugProxyHost, debugProxyPort } = useSettingStore()
  let redirectUrl = `http://${debugProxyHost}:${debugProxyPort}/redirect`
  let params = Object.keys(info).filter(v => info[v])
    .map((key: string) => `${encodeURIComponent(key)}=${encodeURIComponent(info[key]!!)}`)
  return `${redirectUrl}?${params.join('&')}`
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

export async function createProxyServer(port: number) {
  const url = require('url')
  const proxyServer: Server = http.createServer(async (clientReq: IncomingMessage, clientRes: ServerResponse) => {
    const { pathname, query } = url.parse(clientReq.url, true)
    const { user_id, drive_id, file_id, file_size, encType, password, proxy_url, proxy_headers, proxy_kind, content_disposition, file_name } = query
    console.info('proxy query: ', query)
    if (pathname === '/proxy') {
      const driveId = String(drive_id || '')
      const fileId = String(file_id || '')
      let proxyInfo: any = await Db.getValueObject('ProxyInfo')
      let proxyUrl = proxy_url || (proxyInfo && proxyInfo.proxy_url || '') || ''
      let { securityEncType, securityFileNameAutoDecrypt } = useSettingStore()
      if (shouldRefreshProxyUrl({ driveId, fileId, proxyUrl: String(proxyUrl || ''), proxyInfo })) {
        // 获取地址
        const downUrl = await AliFile.ApiFileDownloadUrl(user_id, drive_id, file_id, 14400)
        if (typeof downUrl != 'string' && downUrl.url) {
          proxyUrl = downUrl.url
          proxyInfo = undefined
        }
      }
      console.warn('proxyUrl', proxyUrl)
      if (!proxyUrl) {
        clientRes.writeHead(404, { 'Content-Type': 'text/plain' })
        clientRes.end()
        await Db.deleteValueObject('ProxyInfo')
        return
      } else if (!proxyInfo && proxy_kind !== 'subtitle') {
        let info: FileInfo = {
          user_id, drive_id, file_id, file_size, encType,
          expires_time: GetExpiresTime(proxyUrl),
          proxy_url: proxyUrl
        }
        await Db.saveValueObject('ProxyInfo', info)
      }
      // 转码文件302重定向
      if (proxyUrl.includes('.aliyuncs.com')) {
        clientRes.writeHead(302, { 'Location': proxyUrl })
        clientRes.end()
        return
      }
      console.warn('proxy.range', clientReq.headers.range)
      // 是否需要解密
      let decryptTransform: any = null
      if (encType) {
        // 要定位请求文件的位置 bytes=xxx-
        const range = clientReq.headers.range
        const start = range ? parseInt(range.replace('bytes=', '').split('-')[0]) : 0
        const flowEnc = getFlowEnc(user_id, file_size, encType, password)!!
        decryptTransform = flowEnc.decryptTransform()
        if (start) {
          await flowEnc.setPosition(start)
        }
      }
      const upstreamHeaders = ensureInlinePreviewRange(
        buildUpstreamProxyHeaders(clientReq.headers, String(proxy_headers || '')),
        content_disposition === 'inline'
      )
      await new Promise((resolve) => {
        let isFinished = false
        const finishResponse = (endClient = false) => {
          if (isFinished) return
          isFinished = true
          if (endClient && !clientRes.writableEnded) clientRes.end()
          resolve(true)
        }
        // 处理请求，让下载的流量经过代理服务器
        const httpRequest = ~proxyUrl.indexOf('https') ? https : http
        const agentServer = httpRequest.request(proxyUrl, {
          method: clientReq.method,
          headers: upstreamHeaders,
          rejectUnauthorized: false,
          agent: ~proxyUrl.indexOf('https') ? httpsAgent : httpAgent
        }, (httpResp: any) => {
          console.error('httpResp.headers', httpResp.statusCode, httpResp.headers)
          const responseHeaders = normalizeProxyRangeHeaders({ ...httpResp.headers } as ProxyResponseHeaders)
          const statusCode = Number(httpResp.statusCode || 0)
          clientRes.statusCode = normalizeProxyStatusCode(statusCode, responseHeaders['content-range'])
          for (const key in responseHeaders) {
            const value = responseHeaders[key]
            if (value !== undefined) clientRes.setHeader(key, value)
          }
          if (content_disposition === 'inline') {
            const inlineFileName = String(file_name || getUrlFileName(proxyUrl) || 'preview')
            clientRes.setHeader('content-disposition', `inline; filename*=UTF-8''${encodeURIComponent(inlineFileName)};`)
          }
          if (statusCode % 300 < 5) {
            // 可能出现304，redirectUrl = undefined
            const redirectUrl = httpResp.headers.location || '-'
            if (decryptTransform) {
              // Referer
              httpResp.headers.location = getProxyUrl({
                user_id, drive_id, file_id, password,
                file_size, encType, proxy_url
              })
            }
            console.log('302 redirectUrl:', redirectUrl)
          }
          // 解密文件名
          if (clientReq.method === 'GET' && clientRes.statusCode === 200 && encType && securityFileNameAutoDecrypt) {
            let fileName = getUrlFileName(proxyUrl)
            if (fileName) {
              let ext = path.extname(fileName)
              let securityPassword = getEncPassword(user_id, encType, password)
              let decName = decodeName(securityPassword, securityEncType, fileName.replace(ext, '')) || ''
              clientRes.setHeader('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(decName + ext)};`)
            }
          }
          httpResp.on('end', () => {
            finishResponse()
          })
          if (decryptTransform) {
            httpResp.pipe(decryptTransform).pipe(clientRes)
          } else {
            httpResp.pipe(clientRes)
          }
          httpResp.on('aborted', () => {
            finishResponse(true)
          })
          httpResp.on('error', () => {
            finishResponse(true)
          })
          httpResp.on('close', () => {
            if (!httpResp.complete) finishResponse(true)
          })
        })
        clientReq.pipe(agentServer)
        // 关闭解密流
        agentServer.on('close', async () => {
          decryptTransform && decryptTransform.destroy()
        })
        agentServer.on('error', (e: Error) => {
          finishResponse(true)
          console.log('proxyServer socket error: ' + e)
        })
        // 重定向的请求 关闭时 关闭被重定向的请求
        clientRes.on('close', async () => {
          agentServer.destroy()
        })
      })
      clientReq.on('error', (e: Error) => {
        console.log('client socket error: ' + e)
      })
    }
  })
  proxyServer.listen(port)
  proxyServer.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
      proxyServer.close()
      proxyServer.removeAllListeners('error')
      DebugLog.mSaveDanger(`端口：${port}已被占用，请前往【高级选项->刷新端口】`)
      message.error(`端口：${port}已被占用，请前往【高级选项->刷新端口】`, 5)
    }
  })
  return proxyServer
}
