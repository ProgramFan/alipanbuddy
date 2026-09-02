import { defineStore } from 'pinia'
import { IStateUploadTask } from '../utils/dbupload'
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
