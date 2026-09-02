import { defineStore } from 'pinia'
import DBUpload, { IStateUploadTask } from './dbupload'
import { useSettingStore } from '../store'
import { clickWait, clickWaitDelete } from '../utils/debounce'
import { createSelectableListActions, createSelectableListState, createSelectionGetters, SelectableListConfig, SelectableListState } from '../store/selectableList'

type Item = IStateUploadTask

export interface UploadedState extends SelectableListState<Item, number, number> {
  ListDataCount: number
}

type State = UploadedState

const listConfig: SelectableListConfig<Item, number, number> = {
  keyField: 'TaskID',
  emptyKey: 0,
  defaultOrderKey: 0,
  searchKeys: ['TaskName'],
  preserveFocusOnLoad: false
}

const useUploadedStore = defineStore('uploaded', {
  state: (): State => ({
    ...createSelectableListState(listConfig),
    ListDataCount: 0
  }),

  getters: {
    ...createSelectionGetters<State>()
  },

  actions: {
    ...createSelectableListActions(listConfig),

    mGetFocus() {
      if (this.ListFocusKey > 0 && this.ListDataShow.length > 0) return this.ListDataShow[0].TaskID
      return this.ListFocusKey
    },

    mDeleteFiles(taskidlist: number[]) {
      const fileMap = new Set(taskidlist)
      const listDataRaw = this.ListDataShow
      const newDataList: Item[] = []
      for (let i = 0, maxi = listDataRaw.length; i < maxi; i++) {
        const item = listDataRaw[i]
        if (!fileMap.has(item.TaskID)) {
          newDataList.push(item)
        }
      }
      this.ListDataShow = newDataList
      this.mRefreshListDataShow(true)
    }
  }
})

export default useUploadedStore

/** The finished-uploads list: reload, trim to the configured maximum, delete rows. */
export class UploadedDAL {

  static async aReloadUploaded() {
    const uploadedStore = useUploadedStore()
    if (uploadedStore.ListLoading == true) return
    uploadedStore.ListLoading = true
    const max = useSettingStore().debugDownedListMax
    const showlist = await DBUpload.getUploadedByTop(max)
    const count = await DBUpload.getUploadTaskCount()
    uploadedStore.aLoadListData(showlist, count)
    uploadedStore.ListLoading = false
  }


  static async aClearUploaded() {
    const max = useSettingStore().debugDownedListMax
    return await DBUpload.deleteUploadedOutCount(max)
  }


  static async UploadedDelete(all: boolean) {
    if (clickWait('UploadedDelete', -1)) return
    if (all) {
      await DBUpload.clearUploadedAll()
    } else {
      const uploadedStore = useUploadedStore()
      const keys = Array.from(uploadedStore.ListSelected)
      await DBUpload.deleteUploadedBatch(keys)
    }
    await this.aReloadUploaded()
    clickWaitDelete('UploadedDelete')
  }
}
