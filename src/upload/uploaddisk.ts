import { IUploadingUI } from './dbupload'
import DebugLog from '../utils/debuglog'
import { IUploadInfo } from '../aliapi/models'
import AliUpload from '../aliapi/upload'
import DBCache from '../utils/dbcache'
import UserDAL from '../user/userdal'
import AliUploadHashPool from './uploadhashpool'
import path from '../utils/path'
import { useSettingStore } from '../store'
import { getEncPassword } from '../utils/proxyhelper'
import { playUploadFinished } from '../utils/finishsound'
import { uploadCancel, uploadPart, type UploadEncryption, type UploadProgress } from '../tauri/upload'

const filePosMap = new Map<number, number>()
let UploadSpeedTotal = 0
export default class AliUploadDisk {

  /** Encryption parameters handed to the Rust uploader (the cipher is applied on the fly while streaming). */
  static GetUploadEncryption(fileui: IUploadingUI): UploadEncryption | null {
    if (!fileui.encType) return null
    const alg = useSettingStore().securityEncType == 'rc4md5' ? 'rc4md5' : 'aesctr'
    return { alg, password: getEncPassword(fileui.user_id, fileui.encType), fileSize: fileui.File.size }
  }

  static async UploadOneFile(uploadInfo: IUploadInfo, fileui: IUploadingUI): Promise<string> {
    const encryption = AliUploadDisk.GetUploadEncryption(fileui)
    if (uploadInfo.part_info_list.length > 1) {
      return AliUploadDisk.UploadOneFileBig(uploadInfo, fileui, encryption)
    }
    const upload_url = uploadInfo.part_info_list[0].upload_url
    const filePath = path.join(fileui.localFilePath, fileui.File.partPath)
    filePosMap.set(fileui.UploadID, 0)
    let isok = ''
    for (let i = 0; i < 3; i++) {
      isok = await AliUploadDisk.UploadOneFilePart(
        fileui, encryption, filePath,
        0, fileui.File.size, upload_url
      )
      if (isok == 'success') {
        break
      }
      if (!fileui.IsRunning) break
    }
    if (!fileui.IsRunning && isok !== 'success') return '已暂停'
    if (isok !== 'success') return isok || '分片上传失败，请重试'
    return AliUpload.UploadFileComplete(
      fileui.user_id, fileui.drive_id,
      fileui.Info.up_file_id, fileui.Info.up_upload_id,
      fileui.File.size, uploadInfo.sha1
    )
      .then(async (isSuccess) => {
        fileui.File.uploaded_file_id = fileui.Info.up_file_id
        fileui.File.uploaded_is_rapid = false
        fileui.Info.up_file_id = ''
        fileui.Info.up_upload_id = ''
        if (isSuccess) {
          if (useSettingStore().downFinishAudio) {
            playUploadFinished()
          }
          return 'success'
        } else return '合并文件时出错，请重试'
      })
      .catch((err: any) => {
        DebugLog.mSaveDanger('合并文件时出错', err)
        return '合并文件时出错，请重试'
      })
  }

  static async UploadOneFileBig(uploadInfo: IUploadInfo, fileui: IUploadingUI, encryption: UploadEncryption | null): Promise<string> {
    filePosMap.set(fileui.UploadID, 0)
    const filePath = path.join(fileui.localFilePath, fileui.File.partPath)
    const fileSize = fileui.File.size
    for (let i = 0, maxi = uploadInfo.part_info_list.length; i < maxi; i++) {
      let part = uploadInfo.part_info_list[i]
      const partStart = (part.part_number - 1) * part.part_size
      const partEnd = partStart + part.part_size
      const partSize = partEnd > fileSize ? fileSize - partStart : part.part_size
      if (part.isupload) {
        filePosMap.set(fileui.UploadID, partStart + partSize)
      } else {
        const url = part.upload_url
        let expires = url.substring(url.indexOf('x-oss-expires=') + 'x-oss-expires='.length)
        expires = expires.substring(0, expires.indexOf('&'))
        const lastTime = parseInt(expires) - Date.now() / 1000
        if (lastTime < 5 * 60) {
          await AliUpload.UploadFilePartUrl(
            fileui.user_id, fileui.drive_id, fileui.Info.up_file_id,
            fileui.Info.up_upload_id, fileui.File.size, uploadInfo
          ).catch()
          if (uploadInfo.part_info_list.length == 0) return '获取分片信息失败，请重试'
          part = uploadInfo.part_info_list[i]
        }
        let isok = ''
        for (let j = 0; j < 3; j++) {
          isok = await AliUploadDisk.UploadOneFilePart(
            fileui, encryption, filePath,
            partStart, partSize, part.upload_url
          )
          if (isok == 'success') {
            part.isupload = true
            break
          }
          if (!fileui.IsRunning) break
        }
        if (!fileui.IsRunning) break
        if (!part.isupload) {
          return isok
        }
      }
    }
    if (!fileui.IsRunning) return '已暂停'
    for (let i = 0, maxi = uploadInfo.part_info_list.length; i < maxi; i++) {
      if (!uploadInfo.part_info_list[i].isupload) {
        return '有分片上传失败，请重试'
      }
    }

    if (!fileui.encType && !uploadInfo.sha1) {
      if (fileui.File.size >= 1024000) {
        const prehash = await AliUploadHashPool.GetFilePreHash(filePath)
        if (fileui.File.size >= 10240000 && !prehash.startsWith('error')) {
          uploadInfo.sha1 = await DBCache.getFileHash(fileui.File.size, fileui.File.mtime, prehash, path.basename(fileui.File.name))
        }
      }
    }

    return AliUpload.UploadFileComplete(fileui.user_id, fileui.drive_id, fileui.Info.up_file_id, fileui.Info.up_upload_id, fileui.File.size, uploadInfo.sha1)
      .then(async (isSuccess) => {
        if (isSuccess) {
          if (useSettingStore().downFinishAudio) {
            playUploadFinished()
          }
          return 'success'
        } else return '合并文件时出错，请重试'
      })
      .catch((err: any) => {
        DebugLog.mSaveDanger('合并文件时出错', err)
        return '合并文件时出错，请重试'
      })
  }

  /** Uploads one byte range of the file through the Rust streaming uploader. */
  static async UploadOneFilePart(fileui: IUploadingUI, encryption: UploadEncryption | null, filePath: string, partStart: number, partSize: number, upload_url: string): Promise<string> {
    const token = await UserDAL.GetUserTokenFromDB(fileui.user_id)
    if (!token || !token.access_token) {
      return '找不到上传token，请重试'
    }

    let cancelled = false
    const cancelIfStopped = () => {
      if (fileui.IsRunning || cancelled) return
      cancelled = true
      uploadCancel(fileui.UploadID)
    }
    const onProgress = (progress: UploadProgress) => {
      if (progress.delta > 0) UploadSpeedTotal += progress.delta
      filePosMap.set(fileui.UploadID, progress.pos)
      cancelIfStopped()
    }
    // the network may stall without progress events, so also poll the running flag
    const stopWatcher = setInterval(cancelIfStopped, 1000)
    try {
      const result = await uploadPart(
        {
          taskId: fileui.UploadID,
          path: filePath,
          start: partStart,
          size: partSize,
          url: upload_url,
          authorization: token.token_type + ' ' + token.access_token,
          encryption
        },
        onProgress
      )
      if (result.status == 200) {
        return 'success'
      } else if (result.status == 409 && (result.body || '').indexOf('PartAlreadyExist') >= 0) {
        return 'success'
      } else {
        DebugLog.mSaveDanger('分片上传失败，稍后重试' + result.status)
        return '分片上传失败，稍后重试' + result.status
      }
    } catch (error: any) {
      DebugLog.mSaveWarning('分片上传失败，稍后重试', error)
      const message = (error && (error.message || error.code)) || '网络错误'
      return '分片上传失败，稍后重试' + message
    } finally {
      clearInterval(stopWatcher)
    }
  }

  static GetFileUploadSpeed(UploadID: number): number {
    return filePosMap.get(UploadID) || 0
  }

  static DelFileUploadSpeed(UploadID: number): void {
    filePosMap.delete(UploadID)
  }


  static GetFileUploadSpeedTotal(): number {
    const speed = Number(UploadSpeedTotal)
    UploadSpeedTotal = 0
    return speed
  }
}
