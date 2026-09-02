/**
 * Tauri replacement for the former Electron preload script.
 * Installs the DOM level integrations (context menu, devtools, drag region) and exposes platform
 * information. The typed command wrappers live in `./app`.
 */
import { listen } from '@tauri-apps/api/event'
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
  windowType: 'main' | 'preview'
}

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

/** Parses `index.html#page=PageImage&label=preview-1` style routing information. */
export function parsePageRoute(): { page: string; label: string } {
  const hash = (typeof location !== 'undefined' ? location.hash : '').replace(/^#\??/, '')
  const params = new URLSearchParams(hash)
  return { page: params.get('page') || 'PageMain', label: params.get('label') || '' }
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
  if (isTauri()) installDomIntegrations()
  return platformInfo
}

export { listen }
