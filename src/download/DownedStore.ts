import { defineStore } from 'pinia'
import DownDAL, { IStateDownFile } from './DownDAL'
import { humanSize } from '../utils/format'
import message from '../utils/message'
import fs from '../tauri/fs'
import path from '../utils/path'
import { openPath, showItemInFolder } from '../tauri/app'
import { t } from '../i18n'
import { createSelectableListActions, createSelectableListState, createSelectionGetters, SelectableListConfig, SelectableListState } from '../store/selectableList'

type Item = IStateDownFile

interface DownState extends SelectableListState<Item> {
  ListDataCount: number
}

type State = DownState

const listConfig: SelectableListConfig<Item> = {
  keyField: 'DownID',
  emptyKey: '',
  defaultOrderKey: 'DownID',
  searchKeys: ['Info.name'],
  preserveFocusOnLoad: false
}

const useDownStore = defineStore('down', {
  state: (): State => ({
    ...createSelectableListState(listConfig),
    ListDataCount: 0
  }),

  getters: {
    ...createSelectionGetters<State>(),

    ListStats(state: State) {
      const stats = { count: 0, runningCount: 0, totalSize: 0, totalSizeStr: '' }
      const list = state.ListDataShow
      let item: Item
      for (let i = 0, maxi = list.length; i < maxi; i++) {
        item = list[i]
        stats.count++
        stats.totalSize += item.Info.size
        if (item.Down.IsDowning) stats.runningCount++
      }
      stats.totalSizeStr = humanSize(stats.totalSize)
      return stats
    }
  },

  actions: {
    ...createSelectableListActions(listConfig),

    /**
     * 删除下载完成，修改为“待删除”状态，并从列表中删除 <br/>
     * @param downedIDList
     */
    async mDeleteDowned(downedIDList: string[]) {
      const newListSelected = new Set(this.ListSelected)
      const newList: Item[] = []
      const downedList: Item[] = this.ListDataRaw
      const deleteList: Item[] = []
      for (let j = 0; j < downedList.length; j++) {
        const downID = downedList[j].DownID
        if (downedIDList.includes(downID)) {
          downedList[j].Down.DownState = '待删除'
          deleteList.push(downedList[j])
          if (newListSelected.has(downID)) newListSelected.delete(downID)
        } else {
          newList.push(downedList[j])
        }
      }
      this.ListDataRaw = newList
      this.ListSelected = newListSelected
      await DownDAL.deleteDowned(false, deleteList)
      this.mRefreshListDataShow(true)
    },

    /**
     * 删除全部
     */
    async mDeleteAllDowned() {
      await DownDAL.deleteDowned(true, this.ListDataRaw)
      this.ListSelected = new Set<string>()
      this.ListDataRaw.splice(0, this.ListDataRaw.length)
      this.mRefreshListDataShow(true)
    },

    /**
     * 打开下载完成的文件 <br/>
     * file 和 downIDList 二选一
     * @param file
     * @param downIDList
     * @param isDir 是否打开目录
     */
    async mOpenUploadedFile(file: Item | null, downIDList: string[], isDir: boolean) {
      const DownedList = this.ListDataRaw
      const resolveExistingPath = (item: Item) => item.Info.localFilePath || path.join(item.Info.DownSavePath, item.Info.name)

      const openDir = async (localFilePath: string, savePath: string) => {
        try {
          if (await fs.exists(localFilePath)) {
            await showItemInFolder(localFilePath)
          } else if (await fs.exists(savePath)) {
            await openPath(savePath)
          } else {
            message.error(t('transfer.folderMayDeleted'))
          }
        } catch {
        }
      }

      const openFile = async (localFilePath: string) => {
        try {
          if (await fs.exists(localFilePath)) {
            await openPath(localFilePath)
          } else {
            message.error(t('transfer.fileMayDeleted'))
          }
        } catch {
        }
      }

      if (file) {
        if (file.Info.ariaRemote) {
          message.error(t('transfer.remoteDownloadUnsupported'))
          return
        }
        const localFilePath = resolveExistingPath(file)
        if (isDir) {
          await openDir(localFilePath, file.Info.DownSavePath)
        } else {
          await openFile(localFilePath)
        }
        return
      }

      let opDownIDList = downIDList
      if (downIDList.length > 10) {
        message.info(t('transfer.openFirstTenOnly'), 10)
        opDownIDList = downIDList.slice(0, 10)
      }
      for (let j = 0; j < DownedList.length; j++) {
        const downID = DownedList[j].DownID
        if (opDownIDList.includes(downID)) {
          if (DownedList[j].Info.ariaRemote) {
            message.error(t('transfer.remoteDownloadUnsupported'))
            continue
          }
          const localFilePath = resolveExistingPath(DownedList[j])
          if (isDir) {
            await openDir(localFilePath, DownedList[j].Info.DownSavePath)
          } else {
            await openFile(localFilePath)
          }
        }
      }
    }
  }
})

export default useDownStore
