import UserDAL from '../user/userdal'

export type DriveContext = { title: string; name: string; key: string }

export function getDriveId(userId: string, drive: string): string {
  const token = UserDAL.GetUserToken(userId)
  if (!token) return ''
  if (drive.includes('backup')) return token.backup_drive_id || ''
  if (drive.includes('resource')) return token.resource_drive_id || ''
  if (drive.includes('pic')) return token.pic_drive_id || ''
  if (drive.includes('safe')) return token.default_sbox_drive_id || ''
  return ''
}

export function getDriveType(userId: string, driveId: string): DriveContext {
  const token = UserDAL.GetUserToken(userId)
  if (!token) return { title: '未知网盘', name: 'unknown', key: '' }
  if (driveId === token.backup_drive_id) return { title: '备份盘', name: 'backup', key: 'backup_root' }
  if (driveId === token.resource_drive_id) return { title: '资源盘', name: 'resource', key: 'resource_root' }
  if (driveId === token.pic_drive_id) return { title: '全部相册', name: 'pic', key: 'pic_root' }
  if (driveId === token.default_sbox_drive_id) return { title: '安全盘', name: 'safe', key: 'safe_root' }
  return { title: '未知网盘', name: 'unknown', key: '' }
}
