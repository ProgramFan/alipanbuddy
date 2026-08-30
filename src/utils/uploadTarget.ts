/** Aliyun folder IDs are 40-char hashes; virtual roots end with root. */
export const isValidDropUploadTarget = (_userId: string, _driveId: string, fileId: string): boolean => {
  const id = String(fileId || '')
  return id.length === 40 || id.includes('root')
}
