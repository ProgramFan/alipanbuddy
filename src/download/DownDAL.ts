import { IAliGetFileModel } from '../aliapi/alimodels'
import path from '../utils/path'
import TreeStore from '../store/treestore'
import { useDownedStore, useDowningStore, useFootStore, useSettingStore, useUserStore } from '../store'
import { ClearFileName } from '../utils/filehelper'
import message from '../utils/message'
import {
  AriaAddUrl,
  AriaConnect,
  AriaDeleteList,
  AriaGetDowningList,
  AriaHashFile,
  AriaStopList,
  FormatAriaError,
  IsAria2cRemote
} from './aria2c'
import { humanSize, humanSizeSpeed } from '../utils/format'
import DBDown from './dbdown'
import fs from '../tauri/fs'
import { DecodeEncName } from '../aliapi/utils'
import { getEncType } from '../utils/proxyhelper'
import { SHA256 } from 'crypto-js'
import { shouldRemoveAriaStoppedResult } from './aria2Rpc'
import { resolveAriaProgressErrorState } from './integration/downloadProgressState'
import { resolveDriveFileToken } from '../user/userdal'
import { notifyDownloadCompleted, setProgressBar } from '../tauri/app'
import { playDownloadFinished } from '../utils/finishsound'

export interface IStateDownFile {
  DownID: string
  Info: IStateDownInfo

  Down: {
    DownState: string
    DownTime: number
    DownSize: number
    DownSpeed: number
    DownSpeedStr: string
    DownProcess: number
    IsStop: boolean
    IsDowning: boolean
    IsCompleted: boolean
    IsFailed: boolean
    FailedCode: number
    FailedMessage: string

    AutoTry: number

    DownUrl: string
  }
}

interface IStateDownInfo {

  GID: string
  user_id: string

  DownSavePath: string
  ariaRemote: boolean

  file_id: string
  drive_id: string

  name: string
  cloudPath?: string

  size: number
  sizestr: string
  icon: string
  isDir: boolean
  encType: string

  sha1: string

  crc64: string

  localFilePath?: string
}

export interface IAriaDownProgress {
  gid: string
  status: string
  totalLength: string
  completedLength: string
  downloadSpeed: string
  errorCode: string
  errorMessage: string
  dir?: string
  files?: Array<{ path?: string; selected?: string | boolean; length?: string | number; completedLength?: string | number }>
}

/** 存盘的时机：默认 10 时进行 */
let SaveTimeWait = 0
/** 正在移动/校验的已完成任务，避免异步重命名期间被下一次速度事件重复处理 */
const hashingDownIDs = new Set<string>()

const buildAriaTaskGid = (file: IAliGetFileModel) => {
  const source = `${file.drive_id || ''}|${file.file_id || ''}|${file.size || 0}`
  return SHA256(source).toString().toLowerCase().replace(/[^0-9a-f]/g, '').slice(0, 16)
}

const isCompletedDowning = (downFile: IStateDownFile) => {
  return downFile.Down.IsCompleted && downFile.Down.DownState === '已完成'
}

export default class DownDAL {

  /**
   * 从DB中加载数据
   */
  static async aReloadDowning() {
    const downingStore = useDowningStore()
    if (downingStore.ListLoading) return
    downingStore.ListLoading = true
    const stateDownFiles = await DBDown.getDowningAll()
    // 首次从DB中加载数据，如果上次意外停止则重新开始，如果手动暂停则保持
    for (const stateDownFile of stateDownFiles) {
      if (!stateDownFile.Down.IsStop && stateDownFile.Down.DownState != '队列中') {
        const down = stateDownFile.Down
        down.IsDowning = false
        down.IsCompleted = false
        down.IsStop = false
        down.DownState = '队列中'
        down.DownSpeed = 0
        down.DownSpeedStr = ''
        down.IsFailed = false
        down.FailedCode = 0
        down.FailedMessage = ''
        down.AutoTry = 0
        down.IsDowning = false
      }
    }
    downingStore.ListDataRaw = stateDownFiles
    downingStore.ListLoading = false
    downingStore.mRefreshListDataShow(true)
  }

  static async aReloadDowned() {
    const downedStore = useDownedStore()
    if (downedStore.ListLoading) return
    downedStore.ListLoading = true
    const max = useSettingStore().debugDownedListMax
    const showlist = await DBDown.getDownedByTop(max)
    const count = await DBDown.getDownedTaskCount()
    downedStore.aLoadListData(showlist, count)
    downedStore.ListLoading = false
  }

  static async aClearDowned() {
    const max = useSettingStore().debugDownedListMax
    return await DBDown.deleteDownedOutCount(max)
  }

  /**
   * 添加到下载动作
   * @param fileList
   * @param savePath
   * @param needPanPath
   */
  static async aAddDownload(fileList: IAliGetFileModel[], savePath: string, needPanPath: boolean) {
    const userID = useUserStore().user_id
    const settingStore = useSettingStore()

    if (savePath.endsWith('/') || savePath.endsWith('\\')) {
      savePath = savePath.substr(0, savePath.length - 1)
    }

    const downlist: IStateDownFile[] = []
    const dTime = Date.now()

    let cPid = ''
    let cPath = ''
    const ariaRemote = settingStore.ariaState == 'remote'
    const sep = settingStore.ariaSavePath.indexOf('/') >= 0 ? '/' : '\\'
    for (let f = 0; f < fileList.length; f++) {
      const file = fileList[f]
      const token = await resolveDriveFileToken(file as IAliGetFileModel & { user_id?: string }, userID)
      if (!token?.user_id) {
        message.error(`添加下载失败：找不到 ${file.drive_id} 对应的已登录账号`)
        continue
      }
      const fileUserId = token.user_id
      const name = ClearFileName(DecodeEncName(fileUserId, file).name)
      let fullPath = savePath
      if (needPanPath) {
        if (cPath != '' && cPid == file.parent_file_id) fullPath = cPath
        else {
          let cPath2 = savePath
          const plist = TreeStore.GetDirPath(file.drive_id, file.parent_file_id)
          for (let p = 0; p < plist.length; p++) {
            const pName = ClearFileName(plist[p].name)
            if (plist[p].file_id.includes('root')) continue
            if (path.join(cPath2, pName, name).length > 250) break
            cPath2 = path.join(cPath2, pName)
          }
          cPid = file.parent_file_id
          cPath = cPath2
          fullPath = cPath2
        }
      }

      if (ariaRemote) {
        if (sep == '/') fullPath = fullPath.replace(/\\/g, '/')
        else fullPath = fullPath.replace(/\//g, '\\')
      }

      const gid = buildAriaTaskGid(file)

      let downloadurl = ''
      let crc64 = ''
      const downitem: IStateDownFile = {
        DownID: fileUserId + '|' + file.file_id,
        Info: {
          GID: gid,
          user_id: fileUserId,
          DownSavePath: fullPath,
          ariaRemote: ariaRemote,
          file_id: file.file_id,
          drive_id: file.drive_id,
          name: name,
          cloudPath: file.path || '',
          size: file.size,
          sizestr: file.sizeStr,
          isDir: file.isDir,
          icon: file.icon,
          encType: getEncType(file),
          sha1: '',
          crc64: crc64
        },
        Down: {
          DownState: '队列中',
          DownTime: dTime + f,
          DownSize: 0,
          DownSpeed: 0,
          DownSpeedStr: '',
          DownProcess: 0,
          IsStop: false,
          IsDowning: false,
          IsCompleted: false,
          IsFailed: false,
          FailedCode: 0,
          FailedMessage: '',
          AutoTry: 0,
          DownUrl: downloadurl
        }
      }
      if (downitem.Info.ariaRemote && !downitem.Info.isDir) downitem.Info.icon = 'iconcloud-download'
      downlist.push(downitem)
    }
    useDowningStore().mAddDownload({ downlist })
  }

  /**
   * 速度事件动作
   */
  static async aSpeedEvent() {
    const downingStore = useDowningStore()
    const downedStore = useDownedStore()
    const settingStore = useSettingStore()

    const isOnline = await AriaConnect()

    if (isOnline && downingStore.ListDataRaw.length) {
      await AriaGetDowningList()
      const ariaRemote = IsAria2cRemote()
      const DowningList: IStateDownFile[] = downingStore.ListDataRaw
      const timeThreshold = Date.now() - 60 * 1000
      const downFileMax = settingStore.downFileMax
      const shouldSkipDown = (Down: any) => {
        return (
          Down.IsCompleted ||
          Down.IsStop ||
          Down.IsDowning ||
          (Down.IsFailed && timeThreshold <= Down.AutoTry)
        )
      }
      let addDowningCount = 0
      for (let i = 0; i < DowningList.length; i++) {
        const DownItem = DowningList[i]
        const { DownID, Info, Down } = DownItem
        if (Info.ariaRemote !== ariaRemote) continue
        if (isCompletedDowning(DownItem)) {
          // 将下载标记为已完成并添加到列表以供稍后处理
          const completedDownId = `${Date.now()}_${Down.DownTime}`
          // 删除已完成的下载并更新数据库
          DowningList.splice(i, 1)
          await DBDown.deleteDowning(DownID)
          // 将已完成的下载添加到下载文件列表中
          const downedData = JSON.parse(JSON.stringify({ DownID: completedDownId, Down, Info }))
          downedStore.ListDataRaw.unshift({ DownID: completedDownId, Down, Info })
          downedStore.mRefreshListDataShow(true)
          await DBDown.saveDowned(completedDownId, downedData)
          if (downedStore.ListSelected.has(completedDownId)) {
            downedStore.ListSelected.delete(completedDownId)
          }
          // 移除Aria2已完成的任务
          await AriaDeleteList([Info.GID])
          i--
        } else if ((addDowningCount + downingStore.ListDataDowningCount) < downFileMax && !shouldSkipDown(Down)) {
          addDowningCount++
          downingStore.mUpdateDownState(DownItem, 'start')
          let state = await AriaAddUrl(DownItem)
          downingStore.mUpdateDownState(DownItem, state)
        }
      }
    } else {
      useFootStore().mSaveDownTotalSpeedInfo('')
    }
    downingStore.mRefreshListDataShow(true)
    downedStore.mRefreshListDataShow(true)
  }

  /**
   * 速度事件方法
   */
  static async mSpeedEvent(list: IAriaDownProgress[]) {
    const downingStore = useDowningStore()
    const settingStore = useSettingStore()
    const DowningList: IStateDownFile[] = downingStore.ListDataRaw
    const ariaRemote = !settingStore.AriaIsLocal

    const dellist: string[] = []
    const saveList: IStateDownFile[] = []

    let hasSpeed = 0

    for (const listItem of list) {
      try {
        const { gid, status, totalLength, completedLength, downloadSpeed, errorCode, errorMessage } = listItem
        const ariaReportedComplete = status === 'complete'
        const isStop = status === 'paused' || status === 'removed'
        const isError = status === 'error'
        const downingItem: IStateDownFile | undefined = DowningList.find((item) => item.Info.ariaRemote === ariaRemote && item.Info.GID === gid)
        if (!downingItem) continue
        const { DownID, Down, Info } = downingItem
        const totalLengthInt = parseInt(totalLength) || 0
        const isComplete = ariaReportedComplete
        const isDowning = isComplete || status === 'active' || status === 'waiting'
        Down.DownSize = parseInt(completedLength) || 0
        Down.DownSpeed = parseInt(downloadSpeed) || 0
        Down.DownSpeedStr = humanSize(Down.DownSpeed) + '/s'
        Down.DownProcess = Math.floor((Down.DownSize * 100) / (totalLengthInt + 1)) % 100
        Down.IsCompleted = isComplete
        Down.IsDowning = isDowning
        const errorState = resolveAriaProgressErrorState({ status, errorCode, errorMessage }, FormatAriaError)
        Down.IsFailed = errorState.isFailed
        // 保护 '队列中' 状态不被 Aria2 'paused' 覆盖（用户刚点开始，aria2.unpause 尚未生效）
        if (Down.DownState !== '队列中') {
          Down.IsStop = isStop
        }
        Down.FailedCode = errorState.failedCode
        Down.FailedMessage = errorState.failedMessage
        if (isComplete) {
          if (hashingDownIDs.has(DownID)) continue
          hashingDownIDs.add(DownID)
          downingStore.mUpdateDownState(downingItem, 'valid')
          const check = await AriaHashFile(downingItem).finally(() => hashingDownIDs.delete(DownID))
          if (check.Check) {
            if (useSettingStore().downFinishAudio) {
              playDownloadFinished()
            }
            downingStore.mUpdateDownState(downingItem, 'downed')
            if (useSettingStore().ariaTaskNotification) notifyDownloadCompleted(Info.name)
          } else {
            downingStore.mUpdateDownState(downingItem, 'error', '移动文件失败，请重新下载')
          }
        } else if (isStop && Down.DownState !== '队列中') {
          downingStore.mUpdateDownState(downingItem, 'stop')
          if (shouldRemoveAriaStoppedResult(status)) dellist.push(gid)
        } else if (isError) {
          downingStore.mUpdateDownState(downingItem, 'error', Down.FailedMessage)
          if (shouldRemoveAriaStoppedResult(status)) dellist.push(gid)
        } else if (isDowning) {
          hasSpeed += Down.DownSpeed
          let lastTime = ((totalLengthInt - Down.DownSize) / (Down.DownSpeed + 1)) % 356400
          if (lastTime < 1) lastTime = 1
          // 进度条
          Down.DownState =
            `${Down.DownProcess}% ${(lastTime / 3600).toFixed(0).padStart(2, '0')}:${((lastTime % 3600) / 60)
              .toFixed(0)
              .padStart(2, '0')}:${(lastTime % 60).toFixed(0).padStart(2, '0')}`
          if (SaveTimeWait > 10) {
            saveList.push(downingItem)
          }
        }
        downingStore.mRefreshListDataShow(true)
      } catch {
        // Ignore any errors
      }
    }
    // 存盘时间
    SaveTimeWait = (SaveTimeWait + 1) % 11
    if (saveList.length) {
      DBDown.saveDownings(JSON.parse(JSON.stringify(saveList)))
    }
    if (dellist.length) {
      AriaDeleteList(dellist).then()
    }
    useFootStore().mSaveDownTotalSpeedInfo(hasSpeed && humanSizeSpeed(hasSpeed) || '')

    const totalBytes = DowningList.reduce((s, d) => s + (parseInt(String(d.Info.size)) || 0), 0)
    const doneBytes = DowningList.reduce((s, d) => s + (d.Down.DownSize || 0), 0)
    const overallProgress = totalBytes > 0 ? doneBytes / totalBytes : -1
    setProgressBar(overallProgress, 'normal')
  }

  static async deleteDowning(isAll: boolean, deleteList: IStateDownFile[], gidList: string[]) {
    // 处理待删除文件
    if (!isAll) {
      const downIDList = deleteList.map(item => item.DownID)
      // console.log('deleteDowning', deleteList)
      await DBDown.deleteDownings(JSON.parse(JSON.stringify(downIDList)))
    } else {
      await DBDown.deleteDowningAll()
    }
    // 停止aria2下载任务
    await AriaStopList(gidList)
    await AriaDeleteList(gidList)
    // 删除临时文件
    for (let downFile of deleteList) {
      let downInfo = downFile.Info
      if (downInfo.ariaRemote) continue
      try {
        if (!downInfo.isDir) {
          let filePath = path.join(downInfo.DownSavePath, downInfo.name)
          let tmpFilePath1 = filePath + '.td.aria2'
          let tmpFilePath2 = filePath + '.td'
          const tmpFilePath3 = filePath + '.td.json'
          await fs.rm(tmpFilePath1, { recursive: true, force: true })
          await fs.rm(tmpFilePath2, { recursive: true, force: true })
          await fs.rm(tmpFilePath3, { recursive: true, force: true })
        }
      } catch (e) {
      }
    }
  }

  static async deleteDowned(isAll: boolean, deleteList: IStateDownFile[]) {
    if (!isAll) {
      // 处理待删除状态
      const downIDList = deleteList
        .filter(list => list.Down.DownState === '待删除')
        .map(item => item.DownID)
      console.log('downedList', deleteList)
      await DBDown.deleteDowneds(JSON.parse(JSON.stringify(downIDList)))
    } else {
      await DBDown.deleteDownedAll()
    }
  }

  static async stopDowning(downList: IStateDownFile[], gidList: string[]) {
    await DBDown.saveDownings(JSON.parse(JSON.stringify(downList)))
    await AriaStopList(gidList)
  }

  static QueryIsDowning() {
    return useDowningStore().ListDataDowningCount > 0
  }

}
