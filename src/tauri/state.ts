/**
 * Small shared renderer state, kept dependency-free so low level helpers (`utils/path`) can read it
 * without pulling in the Tauri API.
 */

export interface UserTokenFallback {
  user_id: string
  access_token: string
  open_api_access_token: string
}

const state = {
  proxyUrl: '',
  platform: 'linux',
  proxyServerPort: 0,
  userToken: { user_id: '', access_token: '', open_api_access_token: '' } as UserTokenFallback
}

export function setHttpProxyUrl(url: string) {
  state.proxyUrl = url || ''
}

/** `process.platform` equivalent reported by the backend (`win32` / `linux` / `darwin`). */
export function setPlatform(platform: string) {
  state.platform = platform || 'linux'
}

export function getPlatform(): string {
  return state.platform
}

/** Port of the local Rust proxy server, 0 until `proxy_start` succeeded. */
export function setProxyServerPort(port: number) {
  state.proxyServerPort = port || 0
}

export function getProxyServerPort(): number {
  return state.proxyServerPort
}

/** Mirrors Electron's `WebUserToken` handler: remember the active account for header fallbacks. */
export function rememberUserToken(data: { user_id?: string; access_token?: string; open_api_access_token?: string; login?: boolean }) {
  if (!data) return
  if (data.login || !state.userToken.user_id || state.userToken.user_id === data.user_id) {
    state.userToken = {
      user_id: data.user_id || '',
      access_token: data.access_token || '',
      open_api_access_token: data.open_api_access_token || state.userToken.open_api_access_token || ''
    }
  }
}

export function getUserTokenFallback(): UserTokenFallback {
  return state.userToken
}
