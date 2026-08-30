/**
 * Tauri replacement for the former Electron preload script.
 * Installs the `window.WebXxx` API the renderer has always used, wires window↔window messaging
 * (main ↔ upload/download workers) over Tauri events and exposes platform information.
 */
import { emitTo, listen, type UnlistenFn } from '@tauri-apps/api/event'
import { decodeWinMsg, encodeWinMsg } from './winmsg'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke, isTauri } from './invoke'
import { rememberUserToken, setHttpProxyUrl } from './state'

export interface PlatformInfo {
  platform: 'win32' | 'darwin' | 'linux' | string
  arch: string
  version: string
  appVersion: string
  execPath: string
  appPath: string
  resourcePath: string
  argv0: string
  argv: string[]
  windowLabel: string
  /** contents of `<appPath>/setting.config` (empty when missing) - the settings store loads synchronously */
  settingJson: string
}

export interface PageContext {
  page: string
  data?: any
  theme?: string
  dark: boolean
  windowType: 'main' | 'upload' | 'download' | 'preview'
}

export type WorkerKind = 'upload' | 'download'

let platformInfo: PlatformInfo = {
  platform: 'linux',
  arch: 'x64',
  version: '',
  appVersion: '',
  execPath: '',
  appPath: '',
  resourcePath: '',
  argv0: '',
  argv: [],
  windowLabel: 'main',
  settingJson: ''
}
let initialized = false

/** `setting.config` text preloaded by the backend so `LoadSetting()` can stay synchronous. */
export function getPreloadedSettingJson(): string {
  return platformInfo.settingJson || ''
}

export function getPlatformInfo(): PlatformInfo {
  return platformInfo
}

/** Parses `index.html#page=PageWorker&type=upload` style routing information. */
export function parsePageRoute(): { page: string; type: string; label: string } {
  const hash = (typeof location !== 'undefined' ? location.hash : '').replace(/^#\??/, '')
  const params = new URLSearchParams(hash)
  return { page: params.get('page') || 'PageMain', type: params.get('type') || '', label: params.get('label') || '' }
}

// ---------- worker window messaging ----------
const workerReady: Record<WorkerKind, boolean> = { upload: false, download: false }
const workerPending: Record<WorkerKind, any[]> = { upload: [], download: [] }

function sendToWorker(kind: WorkerKind, event: any) {
  if (workerReady[kind]) {
    emitTo(kind, 'WinMsg', encodeWinMsg(event)).catch(() => {})
    return
  }
  workerPending[kind].push(event)
  invoke('ensure_transfer_worker', { kind }).catch(() => {})
}

function flushWorker(kind: WorkerKind) {
  workerReady[kind] = true
  const queue = workerPending[kind]
  while (queue.length) emitTo(kind, 'WinMsg', encodeWinMsg(queue.shift())).catch(() => {})
}

/** Called by the upload/download worker window once `window.WinMsg` is installed. */
export async function markWorkerReady(kind: WorkerKind) {
  await invoke('worker_ready', { kind }).catch(() => {})
}

// ---------- window API ----------
function installWindowApi() {
  window.platform = platformInfo.platform
  window.WinMsgToMain = (event: any) => {
    emitTo('main', 'WinMsg', encodeWinMsg(event)).catch(() => {})
  }
  window.WinMsgToUpload = (event: any) => sendToWorker('upload', event)
  window.WinMsgToDownload = (event: any) => sendToWorker('download', event)

  window.WebGetPathForFile = (_file: File) => ''

  window.WebToElectron = (data: any) => {
    try {
      const cmd = data?.cmd
      if (!cmd) return
      if (typeof cmd === 'string') {
        if (['close', 'exit', 'relaunch', 'minsize', 'maxsize'].includes(cmd)) {
          invoke('main_window_cmd', { cmd }).catch(() => {})
        } else if (cmd === 'preventSleep') {
          invoke('prevent_sleep', { flag: !!data.flag }).catch(() => {})
        } else if (cmd === 'downloadProgress') {
          const progress = typeof data.progress === 'number' ? data.progress : -1
          invoke('set_progress_bar', { progress, mode: 'normal' }).catch(() => {})
        } else if (cmd === 'downloadCompleted') {
          if (data.showNotification !== false) invoke('notify_download_completed', { fileName: data.fileName || '' }).catch(() => {})
        }
      } else if (typeof cmd === 'object' && (Object.hasOwn(cmd, 'launchStart') || Object.hasOwn(cmd, 'launchStartShow'))) {
        invoke('set_launch_at_login', { enable: !!cmd.launchStart, show: !!cmd.launchStartShow }).catch(() => {})
      }
    } catch {}
  }

  window.WebToWindow = (data: any, callback?: (result: string) => void) => {
    invoke<string>('window_cmd', { cmd: data?.cmd || '' })
      .then((result) => callback && callback(result))
      .catch(() => callback && callback('missing'))
  }

  window.WebToElectronCB = (data: any, callback?: (result: string) => void) => {
    invoke<string>('main_window_cmd', { cmd: data?.cmd || '' })
      .then((result) => callback && callback(result || 'backdata'))
      .catch(() => callback && callback('backdata'))
  }

  window.WebShowOpenDialogSync = (config: any, callback: (files: string[] | undefined) => void) => {
    invoke<string[] | null>('open_dialog', { options: config || {} })
      .then((files) => callback(files || []))
      .catch(() => callback([]))
  }

  window.WebPlatformSync = (callback: (data: any) => void) => {
    try {
      callback({ ...platformInfo, appPath: platformInfo.appPath, asarPath: platformInfo.resourcePath })
    } catch {}
  }

  window.WebClearCookies = (data: any) => invoke('clear_cookies', { origin: data?.origin || '' }).catch(() => {})
  window.WebClearCache = (data: any) => {
    const storages: string[] = Array.isArray(data?.storages) ? data.storages : []
    return invoke('clear_browsing_data', { all: storages.includes('indexdb') || storages.includes('localstorage') }).catch(() => {})
  }
  window.WebGetCookies = (data: any) => invoke<any[]>('get_cookies', { url: data?.url || '' }).catch(() => [])
  window.WebUserToken = (data: any) => {
    rememberUserToken(data)
    // the Rust image proxy (`/image`) authenticates thumbnail requests with this token
    if (data?.user_id && data?.access_token) invoke('proxy_set_token', { userId: data.user_id, accessToken: data.access_token }).catch(() => {})
  }
  window.WebSaveTheme = (data: any) => invoke('save_theme', { theme: data?.theme || '' }).catch(() => {})
  window.WebReload = () => location.reload()
  window.WebRelaunch = () => invoke('relaunch_app').catch(() => {})
  window.WebRelaunchAria = () => invoke<number>('aria_rpc_port').catch(() => 16800)
  window.WebSetProgressBar = (data: any) => {
    const progress = data && data.pro ? Number(data.pro) : -1
    invoke('set_progress_bar', { progress, mode: data?.mode || 'normal' }).catch(() => {})
  }
  window.WebOpenWindow = (data: any) => invoke('open_page_window', { page: data?.page || '', data: data?.data ?? null, theme: data?.theme || '' }).catch(() => {})
  window.WebShutDown = (data: any) => invoke('shutdown_computer', { sudo: !!data?.sudo, quitApp: !!data?.quitApp }).catch(() => {})
  window.WebSetProxy = (data: { proxyUrl: string }) => {
    setHttpProxyUrl(data?.proxyUrl || '')
    invoke('set_proxy', { proxyUrl: data?.proxyUrl || '' }).catch(() => {})
  }
}

// ---------- helpers used by src/utils/electronhelper.ts ----------
export function openExternal(url: string) {
  return invoke('open_external', { url })
}
export function openPath(path: string) {
  return invoke('open_path', { path })
}
export function showItemInFolder(path: string) {
  return invoke('show_item_in_folder', { path })
}
export function readClipboardText(): Promise<string> {
  return invoke<string>('clipboard_read_text')
}
export function writeClipboardText(text: string): Promise<void> {
  return invoke('clipboard_write_text', { text })
}
export function getPageContext(): Promise<PageContext> {
  return invoke<PageContext>('get_page_context')
}
export function getThemeState(): Promise<{ theme: string; dark: boolean }> {
  return invoke('get_theme_state')
}

// ---------- DOM level integrations (context menu, devtools, drag region) ----------
function isEditable(el: any): boolean {
  if (!el) return false
  if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type !== 'checkbox') || el.contentEditable == 'true') return true
  return isEditable(el.parentNode)
}

function installDomIntegrations() {
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    const target = e.target as HTMLElement
    const selectText = !!window.getSelection()?.toString()
    if (selectText || isEditable(target)) {
      const isReadOnly = target.hasAttribute('readonly')
      invoke('show_context_menu', { showPaste: !isReadOnly && isEditable(target), showCopy: selectText, showCut: !isReadOnly && selectText }).catch(() => {})
    }
  })
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'F12') {
      e.preventDefault()
      invoke('toggle_devtools').catch(() => {})
    }
  })
  const NO_DRAG_SELECTOR = [
    '.q-electron-drag--exception',
    '.no-drag',
    'button',
    'a',
    'input',
    'textarea',
    'select',
    'label',
    'ul',
    'li',
    '[role="menu"]',
    '[role="menuitem"]',
    '[role="button"]',
    '.arco-btn',
    '.arco-input',
    '.arco-input-wrapper',
    '.arco-select',
    '.arco-dropdown',
    '.arco-trigger',
    '.arco-menu',
    '.arco-menu-item',
    '.arco-menu-pop',
    '.arco-menu-pop-header',
    '.arco-menu-overflow-wrap',
    '.arco-avatar',
    '.arco-badge',
    '.arco-tag'
  ].join(', ')
  // Custom title bars: Electron used `-webkit-app-region: drag`; Tauri needs an explicit drag start.
  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement | null
    if (!target || !target.closest) return
    const region = target.closest('.q-electron-drag, [data-tauri-drag-region]')
    if (!region) return
    // Same elements Electron marked `-webkit-app-region: no-drag` (see global.css) plus anything interactive,
    // otherwise the mousedown starts a window drag and the click (e.g. the 网盘/传输/插件 menu) never fires.
    if (target.closest(NO_DRAG_SELECTOR)) return
    const win = getCurrentWindow()
    if (e.detail >= 2) {
      win.toggleMaximize().catch(() => {})
    } else {
      win.startDragging().catch(() => {})
    }
  })
}

async function installListeners() {
  await listen('WinMsg', (event) => {
    Promise.resolve().then(() => {
      try {
        if (window.WinMsg) window.WinMsg(decodeWinMsg(event.payload))
      } catch {}
    })
  })
  await listen<{ kind: WorkerKind }>('worker-ready', (event) => {
    const kind = event.payload?.kind
    if (kind === 'upload' || kind === 'download') flushWorker(kind)
  })
  await listen<{ kind: WorkerKind }>('worker-reset', (event) => {
    const kind = event.payload?.kind
    if (kind === 'upload' || kind === 'download') workerReady[kind] = false
  })
}

/** Must complete before the Vue app is created. */
export async function initBridge(): Promise<PlatformInfo> {
  if (initialized) return platformInfo
  initialized = true
  if (isTauri()) {
    try {
      platformInfo = await invoke<PlatformInfo>('platform_info')
    } catch (err) {
      console.error('platform_info failed', err)
    }
  }
  installWindowApi()
  if (isTauri()) {
    installDomIntegrations()
    await installListeners()
  }
  return platformInfo
}

export { listen, emitTo }
