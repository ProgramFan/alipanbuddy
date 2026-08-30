/** Small shared state between the bridge (window.* API) and the HTTP adapter. */

export interface UserTokenFallback {
  user_id: string
  access_token: string
  open_api_access_token: string
}

const state = {
  proxyUrl: '',
  userToken: { user_id: '', access_token: '', open_api_access_token: '' } as UserTokenFallback
}

export function setHttpProxyUrl(url: string) {
  state.proxyUrl = url || ''
}

export function getHttpProxyUrl(): string {
  return state.proxyUrl
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
