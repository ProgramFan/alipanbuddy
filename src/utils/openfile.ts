import { IAliGetFileModel } from '../aliapi/alimodels'
import AliArchive from '../aliapi/archive'
import AliFile from '../aliapi/file'
import ServerHttp from '../aliapi/server'
import { ITokenInfo, usePanFileStore, usePanTreeStore, useSettingStore, useUserStore } from '../store'
import { IPageImage } from '../store/appstore'
import UserDAL from '../user/userdal'
import { clickWait } from './debounce'
import DebugLog from './debuglog'
import message from './message'
import { modalArchive, modalArchivePassword } from './modal'
import { resolveDriveFileToken } from '../drive/account'
import { openPageWindow } from '../tauri/app'

async function resolveTokenForFile(file: IAliGetFileModel): Promise<ITokenInfo | undefined> {
  return resolveDriveFileToken(file as IAliGetFileModel & { user_id?: string }, useUserStore().user_id)
}

export async function menuOpenFile(file: IAliGetFileModel, password: string = ''): Promise<void> {
  if (clickWait('menuOpenFile', 500)) return
  if (!file.drive_id) file = { ...file, drive_id: usePanTreeStore().drive_id }
  if (file.ext == 'zip' || file.ext == 'rar' || file.ext == '7z') {
    if (file.description && file.description.includes('xbyEncrypt')) {
      message.error('不支持在线预览该格式的加密文件')
      return
    }
    Archive(file.drive_id, file.file_id, file.name, file.parent_file_id, file.icon == 'iconweifa')
    return
  }
  if (file.category == 'image' || file.category == 'image2') {
    await Image(file, password)
    return
  }
  message.info('该文件类型不支持预览，请下载后查看')
}

async function Archive(drive_id: string, file_id: string, file_name: string, parent_file_id: string, weifa: boolean): Promise<void> {
  if (weifa) {
    message.error('违规文件，操作取消')
    return
  }
  const user_id = useUserStore().user_id
  const token = await UserDAL.GetUserTokenFromDB(user_id)
  if (!token || !token.access_token) {
    message.error('在线预览失败 账号失效，操作取消')
    return
  }
  message.loading('加载中...', 2)
  const info = await AliFile.ApiFileInfo(user_id, drive_id, file_id)
  if (info && typeof info == 'string') {
    message.error('在线预览失败 获取文件信息出错：' + info)
    return
  }
  let password = ''
  let resp = await AliArchive.ApiArchiveList(user_id, drive_id, file_id, info.domain_id, info.file_extension || '', password)

  if (!resp) {
    message.error('在线预览失败 获取解压信息出错，操作取消')
    return
  }

  if (resp.state == '密码错误' && useSettingStore().yinsiZipPassword) {
    password = await ServerHttp.PostToServer({
      cmd: 'GetZipPwd',
      sha1: info.content_hash,
      size: info.size
    }).then((serdata) => {
      if (serdata.password) return serdata.password
      return ''
    })
    if (password) resp = await AliArchive.ApiArchiveList(user_id, drive_id, file_id, info.domain_id, info.file_extension || '', password)
  }

  if (!resp) {
    message.error('在线预览失败 获取解压信息出错，操作取消')
    return
  }

  if (resp.state == '密码错误') {
    modalArchivePassword(user_id, drive_id, file_id, file_name, parent_file_id, info.domain_id, info.file_extension || '')
  } else if (resp.state == 'Succeed' || resp.state == 'Running') {
    modalArchive(user_id, drive_id, file_id, file_name, parent_file_id, password)
  } else {
    message.error('在线解压失败 ' + resp.state + '，操作取消')
    DebugLog.mSaveDanger('在线解压失败 ' + resp.state, drive_id + ' ' + file_id)
  }
}

async function Image(file: IAliGetFileModel, password: string = ''): Promise<void> {
  const token = await resolveTokenForFile(file)
  if (!token || !token.access_token) {
    message.error('在线预览失败 账号失效，操作取消')
    return
  }
  message.loading('加载中...', 2)
  const fileList = usePanFileStore().ListDataRaw
  const imageList = fileList.filter((v) => v.category == 'image' || v.category == 'image2')
  if (imageList.length == 0) {
    message.error('获取文件预览链接失败，操作取消')
    return
  }

  const pageImage: IPageImage = {
    user_id: token.user_id,
    drive_id: file.drive_id,
    file_id: file.file_id,
    file_name: file.name,
    mode: useSettingStore().uiImageMode,
    password: password,
    imageList: imageList
  }
  openPageWindow('PageImage', pageImage, 'dark')
}
