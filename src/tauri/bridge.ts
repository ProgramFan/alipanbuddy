/**
 * Tauri replacement for the former Electron preload script.
 * Wires window↔window messaging (main ↔ upload worker) over Tauri events, installs the DOM level
 * integrations (context menu, devtools, drag region) and exposes platform information.
 * The typed command wrappers live in `./app`.
 */
import { emitTo, listen } from '@tauri-apps/api/event'
import { decodeWinMsg, encodeWinMsg } from './winmsg'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke, isTauri } from './invoke'
import { setPlatform } from './state'

export interface PlatformInfo {
  platform: 'win32' | 'linux' | string
  arch: string
  appVersion: string
  appPath: string
  resourcePath: string
  /** contents of `<appPath>/setting.config` (empty when missing) - the settings store loads synchronously */
  settingJson: string
}

export interface PageContext {
  page: string
  data?: any
  theme?: string
  dark: boolean
  windowType: 'main' | 'upload' | 'preview'
}

export type WorkerKind = 'upload'

let platformInfo: PlatformInfo = {
  platform: 'linux',
  arch: 'x64',
  appVersion: '',
  appPath: '',
  resourcePath: '',
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
const workerReady: Record<WorkerKind, boolean> = { upload: false }
const workerPending: Record<WorkerKind, any[]> = { upload: [] }

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

/** Called by the upload worker window once `window.WinMsg` is installed. */
export async function markWorkerReady(kind: WorkerKind) {
  await invoke('worker_ready', { kind }).catch(() => {})
}

/**
 * Worker window messaging. Still installed on `window` because the worker page and the DALs talk to
 * each other by convention; every other legacy global is now a typed function in `./app`.
 */
function installWindowMessaging() {
  window.WinMsgToMain = (event: any) => {
    emitTo('main', 'WinMsg', encodeWinMsg(event)).catch(() => {})
  }
  window.WinMsgToUpload = (event: any) => sendToWorker('upload', event)
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
    if (event.payload?.kind === 'upload') flushWorker('upload')
  })
  await listen<{ kind: WorkerKind }>('worker-reset', (event) => {
    if (event.payload?.kind === 'upload') workerReady.upload = false
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
  setPlatform(platformInfo.platform)
  installWindowMessaging()
  if (isTauri()) {
    installDomIntegrations()
    await installListeners()
  }
  return platformInfo
}

export { listen, emitTo }
