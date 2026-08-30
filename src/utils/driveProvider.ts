import type { ITokenInfo } from '../user/userstore'

export type DriveProvider = ITokenInfo['tokenfrom']

export interface DriveProviderMeta {
  key: DriveProvider
  label: string
  icon: string
}

const driveProviderMap: Record<DriveProvider, DriveProviderMeta> = {
  aliyun: {
    key: 'aliyun',
    label: '阿里云盘',
    icon: 'images/drive-icons/aliyun.svg'
  },
  unknown: {
    key: 'unknown',
    label: '未知网盘',
    icon: ''
  }
}

export const getDriveProviderMeta = (tokenfrom?: string): DriveProviderMeta => {
  return driveProviderMap[(tokenfrom || 'unknown') as DriveProvider] || driveProviderMap.unknown
}

export const getDriveProviderLabel = (tokenfrom?: string): string => getDriveProviderMeta(tokenfrom).label

export const getDriveProviderIcon = (tokenfrom?: string): string => getDriveProviderMeta(tokenfrom).icon

/** Historical Aliyun accounts were persisted before tokenfrom was required. */
export const getStoredTokenProvider = (token?: Pick<ITokenInfo, 'user_id' | 'tokenfrom' | 'access_token'>): DriveProvider => {
  if (!token?.user_id) return 'unknown'
  return 'aliyun'
}

export const isAliyunUser = (user: string | { user_id?: string; tokenfrom?: string } | undefined): boolean => {
  if (!user) return false
  const info = typeof user === 'string' ? { user_id: user, tokenfrom: '' } : { user_id: user.user_id || '', tokenfrom: user.tokenfrom || '' }
  return !!info.user_id && (info.tokenfrom === '' || info.tokenfrom === 'aliyun' || info.user_id.startsWith('aliyun_'))
}

export const isTokenCompatibleWithDrive = (token: Pick<ITokenInfo, 'user_id' | 'tokenfrom'> | undefined, driveId: string) => {
  return !!token?.user_id && !!driveId
}

export const isProviderTokenForUser = (token: ITokenInfo | undefined, userId: string, provider: ITokenInfo['tokenfrom'] = 'aliyun'): token is ITokenInfo => {
  return !!token?.access_token && token.user_id === userId && (token.tokenfrom || 'aliyun') === provider
}
