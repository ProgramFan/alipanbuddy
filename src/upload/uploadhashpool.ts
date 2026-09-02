import { IUploadingUI } from './dbupload'
import DBCache from '../utils/dbcache'
import DebugLog from '../utils/debuglog'
import { FileSystemErrorMessage } from '../utils/filehelper'
import path from '../utils/path'
import fs, { toBase64 } from '../tauri/fs'
import { filePrehash, fileSha1, fileSha1Cancel, type Sha1Progress } from '../tauri/hash'
import { bytesToWordArray } from '../module/flow-enc/lib/bytes'
import CryptoJS from 'crypto-js'


const sha1PosMap = new Map<number, number>()

/** Offset of the 8 proof bytes: first 16 hex chars of md5(token) as a number modulo the file size. */
function GetProofStart(access_token: string, size: number): number {
  const md5a = CryptoJS.MD5(access_token).toString(CryptoJS.enc.Hex)
  return Number(BigInt('0x' + md5a.substring(0, 16)) % BigInt(size))
}

export default class AliUploadHashPool {
  static GetFileHashProofSpeed(UploadID: number) {
    return sha1PosMap.get(UploadID) || 0
  }


  static async GetBuffHashProof(access_token: string, buff: Uint8Array): Promise<{ sha1: string; proof_code: string }> {
    if (buff.length == 0) return { sha1: 'DA39A3EE5E6B4B0D3255BFEF95601890AFD80709', proof_code: '' }
    let hash = CryptoJS.SHA1(bytesToWordArray(buff)).toString(CryptoJS.enc.Hex)
    hash = hash.toUpperCase()
    const start = GetProofStart(access_token, buff.length)
    const end = Math.min(start + 8, buff.length)
    const proof_code = toBase64(buff.subarray(start, end))

    return { sha1: hash, proof_code }
  }


  static async GetFilePreHash(filePath: string): Promise<string> {
    try {
      const hash = await filePrehash(filePath)
      return hash ? hash.toUpperCase() : 'error读取文件失败'
    } catch (err: any) {
      const message = FileSystemErrorMessage(err?.code, err?.message)
      DebugLog.mSaveDanger('UpOne上传文件失败：' + filePath, message)
      return 'error' + message
    }
  }


  static async GetFileHashProofWorker(prehash: string, access_token: string, fileui: IUploadingUI): Promise<{ sha1: string; proof_code: string; error: string }> {
    let hash = ''
    let proof_code = ''
    let error = ''
    const size = fileui.File.size
    if (size == 0) return { sha1: 'DA39A3EE5E6B4B0D3255BFEF95601890AFD80709', proof_code: '', error: '' }
    const filePath = path.join(fileui.localFilePath, fileui.File.partPath)

    if (fileui.File.size >= 10240000 && !prehash.startsWith('error')) {
      const sha1 = await DBCache.getFileHash(fileui.File.size, fileui.File.mtime, prehash, path.basename(fileui.File.name))
      if (sha1) {
        // cached sha1: only the 8 proof bytes have to be read
        const start = GetProofStart(access_token, size)
        const end = Math.min(start + 8, size)
        try {
          const buffb = await fs.readRange(filePath, start, end - start)
          return { sha1, proof_code: toBase64(buffb), error: '' }
        } catch (err: any) {
          const message = FileSystemErrorMessage(err?.code, err?.message)
          DebugLog.mSaveDanger('UpOne上传文件失败：' + filePath, message)
          return { sha1: 'error', proof_code: '', error: message }
        }
      }
    }

    sha1PosMap.set(fileui.UploadID, 0)
    fileui.Info.uploadSize = 0

    let cancelled = false
    const cancelIfStopped = () => {
      if (fileui.IsRunning || cancelled) return
      cancelled = true
      fileSha1Cancel(fileui.UploadID)
    }
    const stopWatcher = setInterval(cancelIfStopped, 1000)
    try {
      const result = await fileSha1({
        taskId: fileui.UploadID,
        path: filePath,
        accessToken: access_token,
        onProgress: (progress: Sha1Progress) => {
          cancelIfStopped()
          sha1PosMap.set(fileui.UploadID, progress.readlen)
          fileui.File.size = progress.size
        }
      })
      hash = (result.sha1 || '').toUpperCase()
      proof_code = result.proofCode || ''
      if (!hash) {
        hash = 'error'
        error = 'workererror'
      }
    } catch (err: any) {
      hash = 'error'
      proof_code = ''
      error = (err && err.message) || 'workererror'
    } finally {
      clearInterval(stopWatcher)
    }

    sha1PosMap.delete(fileui.UploadID)
    fileui.Info.uploadSize = 0

    if (!fileui.IsRunning) return { sha1: 'error', proof_code: '', error: '' }


    if (hash != 'error' && prehash && fileui.File.size > 10240000) {
      DBCache.saveFileHash({ size: fileui.File.size, mtime: fileui.File.mtime, presha1: prehash, sha1: hash, name: path.basename(fileui.File.name) })
    }

    return { sha1: hash, proof_code, error }
  }
}
