import { defineStore } from 'pinia'
import { createSelectionActions, createSelectionGetters, SelectionConfig, SelectionState } from '../store/selectableList'

export interface IUploadingModel {
  UploadID: number
  TaskID: number


  localFilePath: string

  name: string

  sizeStr: string
  icon: string
  isDir: boolean

  uploadState: string

  speedStr: string

  Progress: number

  ProgressStr: string

  errorMessage: string
}

type Item = IUploadingModel

export interface UploadingState extends SelectionState<Item, number> {
  ListLoading: boolean

  ListDataCount: number

  showTaskID: number

  ShowTaskName: string
}

type State = UploadingState

/** 展示的是某个任务的子文件时用 UploadID，展示任务列表时用 TaskID */
let KEY: 'UploadID' | 'TaskID' = 'UploadID'

const listConfig: SelectionConfig<Item, number> = {
  keyField: () => KEY,
  emptyKey: 0
}

const useUploadingStore = defineStore('uploading', {
  state: (): State => ({
    ListLoading: false,
    ListDataShow: [],
    ListSelected: new Set<number>(),
    ListFocusKey: 0,
    ListSelectKey: 0,
    ListDataCount: 0,
    showTaskID: 0,
    ShowTaskName: ''
  }),

  getters: {
    ...createSelectionGetters<State>(),

    ListDataUploadingCount(state: State): number {
      return state.ListDataShow.length
    }
  },

  actions: {
    ...createSelectionActions(listConfig),

    aLoadListData(TaskID: number, TaskName: string, list: Item[], count: number) {
      KEY = TaskID ? 'UploadID' : 'TaskID'
      this.ListDataShow = list

      if (this.showTaskID == TaskID) {
        const oldSelected = this.ListSelected
        const newSelected = new Set<number>()
        let findFocusKey = false
        let findSelectKey = false
        let key = 0
        let listFocusKey = this.ListFocusKey
        let listSelectKey = this.ListSelectKey
        for (let i = 0, maxi = list.length; i < maxi; i++) {
          key = list[i][KEY]
          if (oldSelected.has(key)) newSelected.add(key)
          if (key == listFocusKey) findFocusKey = true
          if (key == listSelectKey) findSelectKey = true
        }

        if (!findFocusKey) listFocusKey = 0
        if (!findSelectKey) listSelectKey = 0

        this.$patch({ ListSelected: newSelected, ListFocusKey: listFocusKey, ListSelectKey: listSelectKey, ListDataCount: count })
      } else {
        this.$patch({ showTaskID: TaskID, ShowTaskName: TaskName, ListSelected: new Set<number>(), ListFocusKey: 0, ListSelectKey: 0, ListDataCount: count })
      }
      this.mRefreshListDataShow(true)
    },

    mShowTask(TaskID: number, TaskName: string) {
      KEY = TaskID ? 'UploadID' : 'TaskID'
      this.$patch({ showTaskID: TaskID, ShowTaskName: TaskName, ListSelected: new Set<number>(), ListFocusKey: 0, ListSelectKey: 0, ListDataShow: [] })
    },

    mRefreshListDataShow(refreshRaw: boolean) {
      if (!refreshRaw) {
        const listDataShow = this.ListDataShow.concat()
        Object.freeze(listDataShow)
        this.ListDataShow = listDataShow
        return
      }
      const freezeList = this.ListDataShow
      const oldSelected = this.ListSelected
      const newSelected = new Set<number>()
      let key = 0
      for (let i = 0, maxi = freezeList.length; i < maxi; i++) {
        key = freezeList[i][KEY]
        if (oldSelected.has(key)) newSelected.add(key)
      }
      this.ListSelected = newSelected
    },

    mGetFocus() {
      if (this.ListFocusKey > 0 && this.ListDataShow.length > 0) return this.ListDataShow[0][KEY]
      return this.ListFocusKey
    },

    mDeleteFiles(idList: number[]) {
      const fileMap = new Set(idList)
      const listDataRaw = this.ListDataShow
      const newDataList: Item[] = []
      for (let i = 0, maxi = listDataRaw.length; i < maxi; i++) {
        const item = listDataRaw[i]
        if (!fileMap.has(item.UploadID)) {
          newDataList.push(item)
        }
      }
      this.ListDataShow = newDataList
      this.mRefreshListDataShow(true)
    }
  }
})

export default useUploadingStore
