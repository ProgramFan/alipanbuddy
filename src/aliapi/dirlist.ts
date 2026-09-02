import DebugLog from '../utils/debuglog'
import { MapValueToArray } from '../utils/utils'
import AliHttp from './alihttp'
import { IAliGetFileModel } from './alimodels'
import AliTrash from './trash'
import type { DirData } from '../store/treestore'
import AliUser from './user'

export interface IDirDataResp {
  items: DirData[]
  next_marker: string

  m_user_id: string
  m_drive_id: string
  dirID: string
  dirName: string
}

export interface IAliDirBatchResp {
  items: IAliGetFileModel[]
  itemsKey: Set<string>
  next_marker: string
  dirID: string
}

export default class AliDirList {
  /** `onProgress(loaded, total)` is called after every batch so the caller can show a percentage. */
  static async ApiFastAllDirListByPID(user_id: string, drive_id: string, drive_root: string, onProgress?: (loaded: number, total: number) => void): Promise<IDirDataResp> {
    const result: IDirDataResp = {
      items: [],
      next_marker: '',
      m_user_id: user_id,
      m_drive_id: drive_id,
      dirID: drive_root,
      dirName: ''
    }
    if (!user_id || !drive_id) return result

    const allMap = new Map<string, DirData>()
    const dirCount = await AliUser.ApiUserDriveFileCount(user_id, '', 'folder')
    const PIDList: string[] = []

    const root = await AliTrash.ApiDirFileListNoLock(user_id, drive_id, drive_root, '', 'name ASC', 'folder', 0)
    for (let i = 0, maxi = root.items.length; i < maxi; i++) {
      const item = root.items[i]
      if (item.parent_file_id === 'root') {
        item.parent_file_id = drive_root
      }
      const add: DirData = {
        file_id: item.file_id,
        drive_id: item.drive_id,
        parent_file_id: item.parent_file_id,
        name: item.name,
        time: item.time,
        description: item.description,
        size: 0
      }
      allMap.set(add.file_id, add)
      PIDList.push(add.file_id)
    }
    let errorMessage = ''
    let dirList: IAliDirBatchResp[] = []
    let index = 0
    while (true) {
      while (dirList.length < 30) {
        if (PIDList.length > index) {
          let dirID = 'parent_file_id in ['
          let add = 0
          for (let maxj = PIDList.length; index < maxj; index++) {
            let PID = PIDList[index].includes('root') ? 'root' : PIDList[index]
            dirID += add == 0 ? '"' + PID + '"' : ',"' + PID + '"'
            add++
            if (add >= 50) break
          }
          dirID += ']'
          dirList.push({ dirID: dirID, next_marker: '', items: [], itemsKey: new Set() } as IAliDirBatchResp)
        } else break
      }
      if (dirList.length == 0) break
      for (let i = 0, maxi = dirList.length; i < maxi; i++) {
        const dir = dirList[i]
        if (!dir) break
        const query = 'type="folder" and ' + dir.dirID
        let postData = {
          drive_id: drive_id,
          limit: 100,
          query: query,
          fields: 'thumbnail',
          order_by: 'name ASC',
          marker: dir.next_marker
        }
        const url = 'adrive/v3/file/search?jsonmask=next_marker%2Citems(drive_id%2Ccreated_at%2Cfile_id%2Cname%2Cparent_file_id%2Cupdated_at%2Cdescription)'
        const resp = await AliHttp.Post(url, postData, user_id, '')
        try {
          if (AliHttp.IsSuccess(resp.code)) {
            const items = resp.body.items
            const list: IAliDirBatchResp[] = []
            dir.next_marker = resp.body.next_marker
            if (dir.next_marker) {
              list.push(dir)
            }
            for (let i = 0, maxi = items.length; i < maxi; i++) {
              const item = items[i]
              if (allMap.has(item.file_id)) continue
              if (item.parent_file_id === 'root') {
                item.parent_file_id = drive_root
              }
              const add: DirData = {
                file_id: item.file_id,
                drive_id: item.drive_id,
                parent_file_id: item.parent_file_id,
                name: item.name,
                time: new Date(item.updated_at).getTime(),
                description: item.description,
                size: 0
              }
              allMap.set(add.file_id, add)
              PIDList.push(add.file_id)
            }
            dirList.length = 0
            dirList = list
            if (onProgress) onProgress(allMap.size, dirCount)
          } else {
            errorMessage = (resp.code || 'unknown').toString()
            DebugLog.mSaveWarning('SSApiBatchDirFileList err=' + errorMessage, resp.body)
            dirList.length = 0
            break
          }
        } catch (err: any) {
          errorMessage = err.message || 'unknown'
          DebugLog.mSaveWarning('ApiBatchDirFileList', err)
          dirList.length = 0
          break
        }
      }
    }
    const list = MapValueToArray(allMap)
    console.log('listcount', list.length)
    result.items = errorMessage ? [] : list
    result.next_marker = errorMessage
    return result
  }
}
