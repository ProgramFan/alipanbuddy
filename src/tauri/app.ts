/**
 * Typed front end for the Tauri commands the renderer drives directly: window control, system
 * integration (dialogs, notifications, cookies, proxy, autostart), clipboard/shell helpers and the
 * app paths. Replaces the Electron-era globals the bridge used to install on `window`.
 *
 * Fire-and-forget wrappers swallow their errors on purpose: the old shims did the same, and
 * `main.ts` turns every unhandled rejection into a toast.
 */
import { invoke } from './invoke'
import { getPlatformInfo } from './bridge'
import { rememberUserToken, setHttpProxyUrl } from './state'
import { throttle } from '../utils/debounce'
import path from '../utils/path'

export type MainWindowCmd = 'close' | 'exit' | 'minsize' | 'maxsize'
export type WindowCmd = 'close' | 'minsize' | 'maxsize'
export type ProgressBarMode = 'none' | 'normal' | 'paused'

export interface OpenDialogOptions {
  title?: string
  buttonLabel?: string
  defaultPath?: string
  filters?: { name: string; extensions: string[] }[]
  /** Electron `dialog.showOpenDialog` property names; only `openDirectory`/`multiSelections` change behaviour. */
  properties?: string[]
}

export interface CookieInfo {
  name: string
  value: string
  domain: string
  path: string
}

export interface UserTokenInfo {
  user_id?: string
  name?: string
  access_token?: string
  open_api_access_token?: string
  tokenfrom?: string
  refresh?: boolean
  login?: boolean
}

// ---------- windows ----------

/** Acts on the `main` window whichever window asks for it. `exit` quits the app, `close` only hides. */
export function mainWindowCmd(cmd: MainWindowCmd): Promise<void> {
  return invoke<void>('main_window_cmd', { cmd }).catch(() => {})
}

/** Acts on the calling window (the preview windows). Resolves to the command the backend ran, or `missing`. */
export function windowCmd(cmd: WindowCmd): Promise<string> {
  return invoke<string>('window_cmd', { cmd }).catch(() => 'missing')
}

export function openPageWindow(page: string, data: any = null, theme = ''): Promise<void> {
  return invoke<void>('open_page_window', { page, data, theme }).catch(() => {})
}

// ---------- system integration ----------

/** `dialog.showOpenDialog` replacement. Resolves to the selected paths, or an empty list when cancelled. */
export function showOpenDialog(options: OpenDialogOptions): Promise<string[]> {
  return invoke<string[] | null>('open_dialog', { options: options || {} })
    .then((files) => files || [])
    .catch(() => [])
}

/** Holds a wake lock while transfers are running. */
export function preventSleep(flag: boolean): Promise<void> {
  return invoke<void>('prevent_sleep', { flag: !!flag }).catch(() => {})
}

export function setProgressBar(progress: number, mode: ProgressBarMode = 'normal'): Promise<void> {
  return invoke<void>('set_progress_bar', { progress, mode }).catch(() => {})
}

export function notifyDownloadCompleted(fileName: string): Promise<void> {
  return invoke<void>('notify_download_completed', { fileName: fileName || '' }).catch(() => {})
}

export function setLaunchAtLogin(enable: boolean, show: boolean): Promise<void> {
  return invoke<void>('set_launch_at_login', { enable: !!enable, show: !!show }).catch(() => {})
}

export function shutDownComputer(options: { sudo?: boolean; quitApp?: boolean } = {}): Promise<void> {
  return invoke<void>('shutdown_computer', { sudo: !!options.sudo, quitApp: !!options.quitApp }).catch(() => {})
}

export function relaunchApp(): Promise<void> {
  return invoke<void>('relaunch_app').catch(() => {})
}

/** Makes sure the bundled aria2c sidecar runs and returns its RPC port. */
export function restartAria(): Promise<number> {
  return invoke<number>('aria_rpc_port').catch(() => 16800)
}

export function saveTheme(theme: string): Promise<void> {
  return invoke<void>('save_theme', { theme: theme || '' }).catch(() => {})
}

export function setProxy(proxyUrl: string): Promise<void> {
  setHttpProxyUrl(proxyUrl || '')
  return invoke<void>('set_proxy', { proxyUrl: proxyUrl || '' }).catch(() => {})
}

// ---------- browser data ----------

/** Resets the hidden login webview so the next login starts from a clean session. */
export function clearCookies(): Promise<void> {
  return invoke<void>('clear_cookies').catch(() => {})
}

/** `all` also wipes IndexedDB/localStorage of the main window. */
export function clearBrowsingData(all: boolean): Promise<void> {
  return invoke<void>('clear_browsing_data', { all: !!all }).catch(() => {})
}

export function getCookies(url: string): Promise<CookieInfo[]> {
  return invoke<CookieInfo[]>('get_cookies', { url: url || '' }).catch(() => [])
}

/** Remembers the active account for the HTTP header fallbacks and authenticates the Rust image proxy. */
export function setActiveUserToken(token: UserTokenInfo): void {
  if (!token) return
  rememberUserToken(token)
  if (token.user_id && token.access_token) invoke('proxy_set_token', { userId: token.user_id, accessToken: token.access_token }).catch(() => {})
}

// ---------- shell + clipboard ----------

export function openExternal(url: string): void {
  if (!url) return
  invoke('open_external', { url }).catch(() => {})
}

export function openPath(filePath: string): Promise<void> {
  return invoke<void>('open_path', { path: filePath })
}

export function showItemInFolder(filePath: string): Promise<void> {
  return invoke<void>('show_item_in_folder', { path: filePath })
}

export function readClipboardText(): Promise<string> {
  return invoke<string>('clipboard_read_text').catch(() => '')
}

export function copyToClipboard(text: string): void {
  invoke('clipboard_write_text', { text }).catch(() => {
    try {
      navigator.clipboard?.writeText(text)
    } catch {}
  })
}

// ---------- app info ----------

export function getAppVersion(): string {
  return getPlatformInfo().appVersion
}

export function getUserData(): string {
  return getPlatformInfo().appPath
}

export function getUserDataPath(fileName: string): string {
  try {
    return path.join(getPlatformInfo().appPath, fileName)
  } catch {
    return ''
  }
}

// ---------- throttled taskbar progress ----------

let ProgressBarBy = ''
let ProgressBarValue = -1
let ProgressBarNew = -1
const flushProgressBar = throttle(() => {
  ProgressBarValue = ProgressBarNew
  setProgressBar(ProgressBarValue, progressBarMode(ProgressBarValue, ProgressBarBy))
}, 5000)

function progressBarMode(value: number, by: string): ProgressBarMode {
  if (value < 0) return 'none'
  return by == 'download' ? 'normal' : 'paused'
}

/** Taskbar progress for the transfer queues. Throttled to one update per 5 s, except for start/stop. */
export function setTransferProgressBar(value: number, by: string): void {
  if (value < 0) value = -1
  if (ProgressBarValue == value && ProgressBarBy == by) return

  ProgressBarNew = value
  ProgressBarBy = by
  if (value < 0 || (ProgressBarValue < 0 && value > 0)) {
    ProgressBarValue = value
    setProgressBar(ProgressBarValue, progressBarMode(ProgressBarValue, ProgressBarBy))
  } else {
    flushProgressBar()
  }
}
