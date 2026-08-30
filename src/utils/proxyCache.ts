export interface ProxyRefreshState {
  driveId: string
  fileId: string
  proxyUrl: string
  proxyInfo?: {
    file_id?: string
    expires_time?: number
  }
}

export const shouldRefreshProxyUrl = (state: ProxyRefreshState): boolean => {
  const needRefreshUrl = state.proxyInfo && (state.fileId !== state.proxyInfo.file_id || (state.proxyInfo.expires_time || 0) <= Date.now())
  return !state.proxyUrl || !!needRefreshUrl
}
