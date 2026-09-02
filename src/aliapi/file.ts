import DebugLog from '../utils/debuglog'
import { GetExpiresTime, HanToPin } from '../utils/utils'
import AliHttp from './alihttp'
import { IAliFileItem, IAliGetDirModel, IAliGetFileModel, IAliGetForderSizeModel } from './alimodels'
import AliDirFileList from './dirfilelist'
import { IDownloadUrl } from './models'
import { DecodeEncName, GetDriveType } from './utils'
import UserDAL from '../user/userdal'

export interface IOfficePreViewUrl {
  preview_url: string
  access_token: string
}

export default class AliFile {
  /** WebOffice preview page + the token the viewer expects through the SDK (private web API; no OpenAPI equivalent). */
  static async ApiOfficePreViewUrl(user_id: string, drive_id: string, file_id: string): Promise<IOfficePreViewUrl | undefined> {
    if (!user_id || !drive_id || !file_id) return undefined
    const resp = await AliHttp.Post('v2/file/get_office_preview_url', { drive_id, file_id, url_expire_sec: 14400 }, user_id, '')
    if (AliHttp.IsSuccess(resp.code) && resp.body?.preview_url) {
      return { preview_url: resp.body.preview_url, access_token: resp.body.access_token || '' }
    }
    if (!AliHttp.HttpCodeBreak(resp.code)) DebugLog.mSaveWarning('ApiOfficePreViewUrl err=' + file_id + ' ' + (resp.code || ''), resp.body)
    return undefined
  }


  static async ApiFileInfo(user_id: string, drive_id: string, file_id: string, ispic: boolean = false): Promise<any | undefined> {
    if (!drive_id || !file_id) return undefined
    if (!user_id || !drive_id || !file_id) return undefined
    let url = ''
    let postData = {}
    if (!ispic) {
      url = 'adrive/v1.0/openFile/get'
      postData = {
        drive_id: drive_id,
        file_id: file_id,
        image_thumbnail_width: 100,
        video_thumbnail_width: 100,
        video_thumbnail_time: 120000
      }
    } else {
      url = 'v2/file/get'
      postData = {
        drive_id: drive_id,
        file_id: file_id,
        url_expire_sec: 14400,
        office_thumbnail_process: 'image/resize,w_400/format,jpeg',
        image_thumbnail_process: 'image/resize,w_400/format,jpeg',
        image_url_process: 'image/resize,w_1920/format,jpeg',
        video_thumbnail_process: 'video/snapshot,t_106000,f_jpg,ar_auto,m_fast,w_400'
      }
    }
    const resp = await AliHttp.Post(url, postData, user_id, '')

    if (AliHttp.IsSuccess(resp.code)) {
      let fileInfo = resp.body as IAliFileItem
      if (fileInfo.name.toLowerCase() === 'default') {
        fileInfo.name = '备份盘'
      } else if (fileInfo.name.toLowerCase() === 'resource') {
        fileInfo.name = '资源盘'
      } else if (fileInfo.name.toLowerCase() === 'alibum') {
        fileInfo.name = '相册'
      } else {
        fileInfo.name = DecodeEncName(user_id, fileInfo).name
      }
      return fileInfo
    } else if (AliHttp.HttpCodeBreak(resp.code)) {
      return (resp.body.message || resp.body) as string
    } else if (!AliHttp.HttpCodeBreak(resp.code)) {
      DebugLog.mSaveWarning('ApiFileInfo err=' + file_id + ' ' + (resp.code || ''), resp.body)
    }
    return '网络错误'
  }


  static async ApiFileDownloadUrl(user_id: string, drive_id: string, file_id: string, expire_sec: number): Promise<IDownloadUrl | string> {
    if (!user_id || !drive_id || !file_id) return '参数错误'
    const data: IDownloadUrl = {
      drive_id: drive_id,
      file_id: file_id,
      expire_time: 0,
      url: '',
      size: 0
    }
    let url = ''
    // 处理OpenApi无法访问相册。Fall back to the DB copy of the token before deciding which API may serve this drive.
    const token = UserDAL.GetUserToken(user_id) || (await UserDAL.GetUserTokenFromDB(user_id))
    let isPic = (!!token && !!token.pic_drive_id && token.pic_drive_id === drive_id) || GetDriveType(user_id, drive_id).name === 'pic'
    if (!isPic) {
      url = 'adrive/v1.0/openFile/getDownloadUrl'
    } else {
      url = 'v2/file/get_download_url'
    }
    const postData: any = {
      drive_id: drive_id,
      file_id: file_id,
      expire_sec: expire_sec
    }
    if (isPic) {
      delete postData.expire_sec
    }
    let resp = await AliHttp.Post(url, postData, user_id, '')
    if (!isPic && (resp.code == 403 || resp.code == 404)) {
      // OpenAPI cannot reach every drive (albums among them): let the web API answer instead
      DebugLog.mSaveWarning('ApiFileDownloadUrl openapi ' + resp.code + ' for ' + drive_id + '/' + file_id + ', retrying with web api', resp.body)
      resp = await AliHttp.Post('v2/file/get_download_url', { drive_id: drive_id, file_id: file_id }, user_id, '')
    }
    if (AliHttp.IsSuccess(resp.code)) {
      data.url = resp.body.cdn_url || resp.body.url
      data.size = resp.body.size
      data.expire_time = GetExpiresTime(data.url)
      return data
    } else if (resp.body.code == 'NotFound.FileId') {
      return '文件已从网盘中彻底删除'
    } else if (resp.body.code == 'ForbiddenFileInTheRecycleBin') {
      return '文件已放入回收站'
    } else if (AliHttp.HttpCodeBreak(resp.code)) {
      return (resp.body.message || resp.body) as string
    } else if (resp.body.code) {
      return resp.body.code as string
    } else if (!AliHttp.HttpCodeBreak(resp.code)) {
      DebugLog.mSaveWarning('ApiFileDownloadUrl err=' + file_id + ' ' + (resp.code || ''), resp.body)
    }
    return '网络错误'
  }
  static async ApiGetFile(user_id: string, drive_id: string, file_id: string): Promise<IAliGetFileModel | undefined> {
    if (!user_id || !drive_id || !file_id) return undefined
    const url = 'v2/file/get'
    const postData = {
      drive_id: drive_id,
      file_id: file_id,
      url_expire_sec: 14400,
      office_thumbnail_process: 'image/resize,w_400/format,jpeg',
      image_thumbnail_process: 'image/resize,w_400/format,jpeg',
      image_url_process: 'image/resize,w_1920/format,jpeg',
      video_thumbnail_process: 'video/snapshot,t_106000,f_jpg,ar_auto,m_fast,w_400'
    }
    const resp = await AliHttp.Post(url, postData, user_id, '')

    if (AliHttp.IsSuccess(resp.code)) {
      return AliDirFileList.getFileInfo(user_id, resp.body as IAliFileItem, '')
    } else if (!AliHttp.HttpCodeBreak(resp.code)) {
      DebugLog.mSaveWarning('ApiGetFile err=' + file_id + ' ' + (resp.code || ''), resp.body)
    }
    return undefined
  }


  static async ApiFileGetPath(user_id: string, drive_id: string, file_id: string): Promise<IAliGetDirModel[]> {
    if (!user_id || !drive_id || !file_id) return []
    const url = 'adrive/v1/file/get_path'
    const postData = {
      drive_id: drive_id,
      file_id: file_id
    }
    const resp = await AliHttp.Post(url, postData, user_id, '')
    const driveType = GetDriveType(user_id, drive_id)
    let items = resp.body.items
    if (AliHttp.IsSuccess(resp.code) && items && items.length > 0) {
      const list: IAliGetDirModel[] = []
      list.push({
        __v_skip: true,
        drive_id: drive_id,
        album_id: '',
        file_id: driveType.key,
        parent_file_id: '',
        name: driveType.title,
        namesearch: HanToPin(driveType.title),
        size: 0,
        time: 0,
        description: ''
      } as IAliGetDirModel)
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i]
        if (item.name === 'Default' || item.name === 'resource' || item.name === 'alibum') {
          continue
        }
        list.push({
          __v_skip: true,
          drive_id: item.drive_id,
          album_id: '',
          file_id: item.file_id,
          parent_file_id: item.parent_file_id || '',
          name: DecodeEncName(user_id, item).name,
          namesearch: HanToPin(item.name),
          size: item.size || 0,
          time: new Date(item.updated_at).getTime(),
          description: item.description || ''
        } as IAliGetDirModel)
      }
      return list
    } else if (!AliHttp.HttpCodeBreak(resp.code)) {
      DebugLog.mSaveWarning('ApiFileGetPath err=' + file_id + ' ' + (resp.code || ''), resp.body)
    }
    return []
  }


  static async ApiFileGetPathString(user_id: string, drive_id: string, file_id: string, dirsplit: string): Promise<string> {
    if (!user_id || !drive_id || !file_id) return ''
    if (file_id.includes('root')) {
      if (file_id.startsWith('backup')) {
        return '备份盘'
      } else if (file_id.startsWith('resource')) {
        return '资源盘'
      } else if (file_id.startsWith('pic')) {
        return '相册'
      }
    }
    const url = 'adrive/v1/file/get_path'
    const postData = {
      drive_id: drive_id,
      file_id: file_id
    }
    const resp = await AliHttp.Post(url, postData, user_id, '')
    if (AliHttp.IsSuccess(resp.code) && resp.body.items && resp.body.items.length > 0) {
      const driveType = GetDriveType(user_id, drive_id)
      const list: string[] = [driveType.title]
      for (let i = resp.body.items.length - 1; i >= 0; i--) {
        const item = resp.body.items[i]
        list.push(DecodeEncName(user_id, item).name)
      }
      return list.join(dirsplit)
    } else if (!AliHttp.HttpCodeBreak(resp.code)) {
      DebugLog.mSaveWarning('ApiFileGetPathString err=' + file_id + ' ' + (resp.code || ''), resp.body)
    }
    return ''
  }


  static async ApiFileGetFolderSize(user_id: string, drive_id: string, file_id: string): Promise<IAliGetForderSizeModel | undefined> {
    if (!user_id || !drive_id || !file_id) return undefined
    const url = 'adrive/v1/file/get_folder_size_info'

    const postData = {
      drive_id: drive_id,
      file_id: file_id
    }
    const resp = await AliHttp.Post(url, postData, user_id, '')

    if (AliHttp.IsSuccess(resp.code)) {
      return resp.body as IAliGetForderSizeModel
    } else if (!AliHttp.HttpCodeBreak(resp.code)) {
      DebugLog.mSaveWarning('ApiFileGetFolderSize err=' + file_id + ' ' + (resp.code || ''), resp.body)
    }
    return { size: 0, folder_count: 0, file_count: 0, reach_limit: false }
  }


  static async ApiUpdateVideoTime(user_id: string, drive_id: string, file_id: string, play_cursor: number): Promise<IAliFileItem | undefined> {
    if (!user_id || !drive_id || !file_id) return undefined
    let url = ''
    let need_open_api = true
    if (need_open_api) {
      url = 'adrive/v1.0/openFile/video/updateRecord'
    } else {
      url = 'adrive/v2/video/update'
    }
    const postVideoData = {
      drive_id: drive_id,
      file_id: file_id,
      play_cursor: Math.trunc(play_cursor).toString()
    }
    const respvideo = await AliHttp.Post(url, postVideoData, user_id, '')
    if (AliHttp.IsSuccess(respvideo.code)) {
      return respvideo.body as IAliFileItem
    } else {
      DebugLog.mSaveWarning('ApiUpdateVideoTime err=' + file_id + ' ' + (respvideo.code || ''), respvideo.body)
    }
    return undefined
  }
}
