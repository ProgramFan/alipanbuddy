import type { IAliGetFileModel } from '../../aliapi/alimodels'
import UserDAL from '../../user/userdal'

const MAX_DIRECTORY_LIST_ITEMS = 20_000

/** Lists every child of an Aliyun directory, paging until the directory is exhausted. */
export const listDriveToolChildren = async (userId: string, driveId: string, fileId: string): Promise<IAliGetFileModel[]> => {
  const token = UserDAL.GetUserToken(userId) || await UserDAL.GetUserTokenFromDB(userId)
  if (!token?.access_token) throw new Error('未登录阿里云盘')
  const { default: AliDirFileList } = await import('../../aliapi/dirfilelist')
  const output: IAliGetFileModel[] = []
  for await (const page of AliDirFileList.ApiDirFileListPages(userId, driveId, fileId, '', 'name asc')) {
    output.push(...page)
    if (output.length >= MAX_DIRECTORY_LIST_ITEMS) break
  }
  return output
}
