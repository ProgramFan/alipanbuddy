/**
 * The Rust proxy server (boxcore::proxy) asks the renderer for a fresh download url when the cached
 * one is missing or expired - the renderer owns the account tokens and signatures.
 */
import AliFile from '../aliapi/file'
import { invoke } from './invoke'
import { listen } from '@tauri-apps/api/event'

interface ProxyNeedUrl {
  id: string
  userId: string
  driveId: string
  fileId: string
}

let installed = false

export function installProxyUrlResolver() {
  if (installed) return
  installed = true
  listen<ProxyNeedUrl>('proxy-need-url', async (event) => {
    const { id, userId, driveId, fileId } = event.payload || ({} as ProxyNeedUrl)
    let url = ''
    try {
      const downUrl = await AliFile.ApiFileDownloadUrl(userId, driveId, fileId, 14400)
      if (typeof downUrl != 'string' && downUrl.url) url = downUrl.url
    } catch {}
    invoke('proxy_provide_url', { id, url }).catch(() => {})
  }).catch(() => {})
}
