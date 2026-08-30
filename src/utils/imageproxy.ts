import { useSettingStore } from '../store'

/**
 * Thumbnails and image previews come from `api.aliyundrive.com/v2/file/download`, which needs the
 * account's `Authorization` header (Electron injected it into every `<img>` request; a Tauri webview
 * cannot). The Rust proxy's `/image` route adds it (tokens arrive via `proxy_set_token`).
 * Callers append `&drive_id=..&file_id=..[&image_thumbnail_process=..]` exactly as before.
 */
export function getImageProxyBase(user_id: string): string {
  const { debugProxyPort } = useSettingStore()
  return `http://127.0.0.1:${debugProxyPort}/image?user_id=${encodeURIComponent(user_id)}&t=${Date.now()}`
}
