import path from './path'
import { throttle } from './debounce'
import { getPlatformInfo, openExternal as bridgeOpenExternal, openPath as bridgeOpenPath, readClipboardText, showItemInFolder as bridgeShowItemInFolder, writeClipboardText } from '../tauri/bridge'

/** Reads the clipboard text. Prefer `getFromClipboardAsync`; this synchronous form only serves the legacy callers. */
export function getFromClipboard(): string {
  let text = ''
  readClipboardText()
    .then((value) => {
      text = value
    })
    .catch(() => {})
  return text
}

export function getFromClipboardAsync(): Promise<string> {
  return readClipboardText().catch(() => '')
}

export function copyToClipboard(text: string): void {
  writeClipboardText(text).catch(() => {
    try {
      navigator.clipboard?.writeText(text)
    } catch {}
  })
}

export function openExternal(url: string): void {
  if (!url) return
  bridgeOpenExternal(url).catch(() => {})
}

export function openPath(filePath: string): Promise<void> {
  return bridgeOpenPath(filePath)
}

export function showItemInFolder(filePath: string): Promise<void> {
  return bridgeShowItemInFolder(filePath)
}

export function getPlatform(): string {
  return getPlatformInfo().platform
}

export function getArch(): string {
  return getPlatformInfo().arch
}

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

export function getResourcesPath(fileName: string): string {
  try {
    return path.join(getPlatformInfo().resourcePath, fileName)
  } catch {
    return ''
  }
}

let ProgressBarBy = ''
let ProgressBarValue = -1
let ProgressBarNew = -1
const setProgressBar = throttle(() => {
  ProgressBarValue = ProgressBarNew
  const mode = ProgressBarValue < 0 ? 'none' : ProgressBarBy == 'download' ? 'normal' : 'paused'
  if (window.WebSetProgressBar) window.WebSetProgressBar({ pro: ProgressBarValue, mode })
}, 5000)

export function SetProgressBar(value: number, by: string): void {
  if (value < 0) value = -1
  if (ProgressBarValue == value && ProgressBarBy == by) return

  ProgressBarNew = value
  ProgressBarBy = by
  if (value < 0 || (ProgressBarValue < 0 && value > 0)) {
    const mode = value < 0 ? 'none' : ProgressBarBy == 'download' ? 'normal' : 'paused'
    ProgressBarValue = value
    if (window.WebSetProgressBar) window.WebSetProgressBar({ pro: ProgressBarValue, mode: mode })
  } else {
    setProgressBar()
  }
}
