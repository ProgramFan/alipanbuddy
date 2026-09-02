import { defineStore } from 'pinia'
import DownDAL, { IStateDownFile } from './DownDAL'
import { humanSize } from '../utils/format'
import message from '../utils/message'
import DBDown from './dbdown'
import { batchPauseTasks, batchRemoveTasks, batchResumeTasks } from './integration/aria2TaskApi'
import { t } from '../i18n'
import { createSelectableListActions, createSelectableListGetters, createSelectableListState, SelectableListConfig, SelectableListState } from '../store/selectableList'

type Item = IStateDownFile

export type DowningState = SelectableListState<Item>

type State = DowningState

const listConfig: SelectableListConfig<Item> = {
  keyField: 'DownID',
  emptyKey: '',
  defaultOrderKey: 'DownID',
  searchKeys: ['Info.name'],
  preserveFocusOnLoad: false
}

const useDowningStore = defineStore('downing', {
  state: (): State => createSelectableListState(listConfig),

  getters: {
    ...createSelectableListGetters<State>(),

    ListDataDowningCount(state: State): number {
      return state.ListDataRaw.filter((down) => down.Down.IsDowning).length
    },

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

    mAddDownload({ downlist }: { downlist: Item[] }) {
      const savelist = []
      const DowningList = this.ListDataRaw
      const haslist = new Set(DowningList.map(item => item.DownID))
      for (const downitem of downlist) {
        if (!haslist.has(downitem.DownID)) {
          savelist.push(downitem)
          haslist.add(downitem.DownID)
        }
      }
      if (savelist.length === 0) {
        message.info(t('transfer.taskAlreadyExists'))
      } else {
        DBDown.saveDownings(JSON.parse(JSON.stringify(savelist)))
        DowningList.push(...savelist)
        this.mRefreshListDataShow(true)
      }
    },

    /**
     * 开始下载，只改变状态，待定时任务处理
     */
    async mStartDowning() {
      const gids: string[] = []
      const DowningList = this.ListDataRaw
      for (const downID of this.ListSelected) {
        const selectedDown: IStateDownFile | undefined = DowningList.find(down => down.DownID === downID)
        if (selectedDown && !selectedDown.Down.IsDowning && !selectedDown.Down.IsCompleted) {
          if (selectedDown.Down.IsStop && selectedDown.Info.GID) gids.push(selectedDown.Info.GID)
          this.mUpdateDownState(selectedDown, 'queue')
        }
      }
      if (gids.length) await batchResumeTasks(gids)
    },

    /**
     * 开始全部
     */
    async mStartAllDowning() {
      const gids: string[] = []
      const DowningList = this.ListDataRaw
      for (let j = 0; j < DowningList.length; j++) {
        const down = DowningList[j].Down
        if (down.IsDowning || down.IsCompleted) continue
        if (down.IsStop && DowningList[j].Info.GID) gids.push(DowningList[j].Info.GID)
        this.mUpdateDownState(DowningList[j], 'queue')
      }
      if (gids.length) await batchResumeTasks(gids)
    },

    /**
     * 暂停下载，只改变状态，待定时任务处理
     */
    async mStopDowning() {
      const gidList: string[] = []
      const downList: Item[] = []
      const DowningList = this.ListDataRaw
      for (const DownID of this.ListSelected) {
        for (let j = 0; j < DowningList.length; j++) {
          if (DowningList[j].DownID == DownID) {
            const down = DowningList[j].Down
            if (down.IsCompleted) continue
            gidList.push(DowningList[j].Info.GID)
            downList.push(DowningList[j])
            this.mUpdateDownState(DowningList[j], 'stop')
            break
          }
        }
      }
      await DownDAL.stopDowning(downList, gidList)
      this.mRefreshListDataShow(true)
    },

    /**
     * 暂停全部
     */
    async mStopAllDowning() {
      const gidList: string[] = []
      const DowningList = this.ListDataRaw
      for (let j = 0; j < DowningList.length; j++) {
        const down = DowningList[j].Down
        if (down.IsCompleted) continue
        gidList.push(DowningList[j].Info.GID)
        this.mUpdateDownState(DowningList[j], 'stop')
      }
      await DownDAL.stopDowning(DowningList, gidList)
      this.mRefreshListDataShow(true)
    },

    /**
     * 删除下载，修改为“待删除”状态，并从列表中删除 <br/>
     * 注：下载服务中的执行列表，请根据状态做进一步处理
     * @param downIDList
     */
    async mDeleteDowning(downIDList: string[]) {
      const gidList: string[] = []
      const newListSelected = new Set(this.ListSelected)
      const newList: Item[] = []
      const DowningList: Item[] = this.ListDataRaw
      const deleteList: Item[] = []
      for (let j = 0; j < DowningList.length; j++) {
        const DownID = DowningList[j].DownID
        if (downIDList.includes(DownID)) {
          DowningList[j].Down.DownState = '待删除'
          gidList.push(DowningList[j].Info.GID)
          deleteList.push(DowningList[j])
          if (newListSelected.has(DownID)) {
            newListSelected.delete(DownID)
          }
        } else {
          newList.push(DowningList[j])
        }
      }
      this.ListDataRaw = newList
      this.ListSelected = newListSelected
      await DownDAL.deleteDowning(false, deleteList, gidList)
      this.mRefreshListDataShow(true)
    },

    /**
     * 删除全部，修改为“待删除”状态，并从列表中删除 <br/>
     * 注：下载服务中的执行列表，请根据状态做进一步处理
     */
    async mDeleteAllDowning() {
      const gidList: string[] = []
      const DowningList = this.ListDataRaw
      for (let j = 0; j < DowningList.length; j++) {
        DowningList[j].Down.DownState = '待删除'
        gidList.push(DowningList[j].Info.GID)
      }
      await DownDAL.deleteDowning(true, DowningList, gidList)
      DowningList.splice(0, DowningList.length)
      this.ListSelected = new Set<string>()
      this.mRefreshListDataShow(true)
    },

    /**
     * 排序
     * @param downIDList 要放在前面的上传ID
     */
    mOrderDowning(downIDList: string[]) {
      const DowningList = this.ListDataRaw
      const newlist: Item[] = []
      const lastlist: Item[] = []

      for (let j = 0; j < DowningList.length; j++) {
        const DownID = DowningList[j].DownID
        let find = false
        for (let i = 0; i < downIDList.length; i++) {
          if (downIDList[i] == DownID) {
            newlist.push(DowningList[j])
            find = true
            break
          }
        }
        if (!find) {
          lastlist.push(DowningList[j])
        }
      }
      DowningList.splice(0, DowningList.length, ...newlist, ...lastlist)
      this.mRefreshListDataShow(true)
    },

    mUpdateDownState(DownItem: IStateDownFile, state: string, msg?: string) {
      const { DownID, Down } = DownItem
      const updateState: any = {
        DownID: DownID,
        IsDowning: false,
        IsCompleted: false,
        DownProcess: 0,
        DownSpeedStr: '',
        DownState: '',
        AutoTry: 0,
        IsFailed: false,
        IsStop: false,
        FailedCode: 0,
        FailedMessage: ''
      }
      switch (state) {
        case 'start':
          updateState.DownState = '解析中'
          updateState.IsDowning = true
          updateState.DownTime = Date.now()
          break
        case 'queue':
          updateState.IsDowning = false
          updateState.DownState = '队列中'
          break
        case 'success':
          updateState.IsDowning = true
          updateState.DownState = '下载中'
          break
        case 'downed':
          updateState.IsDowning = true
          updateState.IsCompleted = true
          updateState.DownState = '已完成'
          updateState.DownProcess = 100
          break
        case 'valid':
          updateState.IsDowning = true
          updateState.IsCompleted = true
          updateState.DownState = '校验中'
          updateState.DownProcess = 100
          break
        case 'stop':
          updateState.IsDowning = false
          updateState.DownState = '已暂停'
          updateState.DownSpeed = 0
          updateState.DownSpeedStr = ''
          updateState.IsStop = true
          break
        case 'error':
          updateState.DownState = '已出错'
          updateState.DownSpeed = 0
          updateState.AutoTry = Date.now()
          updateState.IsFailed = true
          updateState.FailedMessage = msg || state
          break
        default:
          updateState.DownState = '已出错'
          updateState.DownSpeed = 0
          updateState.AutoTry = Date.now()
          updateState.IsFailed = true
          updateState.FailedCode = 504
          updateState.FailedMessage = msg || state
          break
      }
      DownItem.Down = { ...Down, ...updateState }
    },

    async batchPauseSelected(): Promise<void> {
      const gids: string[] = []
      for (const downID of this.ListSelected) {
        const item = this.ListDataRaw.find((d) => d.DownID === downID)
        if (item && item.Info.GID && !item.Down.IsCompleted) {
          gids.push(item.Info.GID)
          this.mUpdateDownState(item, 'stop')
        }
      }
      if (gids.length) await batchPauseTasks(gids)
      this.mRefreshListDataShow(true)
    },

    async batchResumeSelected(): Promise<void> {
      const gids: string[] = []
      for (const downID of this.ListSelected) {
        const item = this.ListDataRaw.find((d) => d.DownID === downID)
        if (item && item.Info.GID && !item.Down.IsCompleted) {
          gids.push(item.Info.GID)
          this.mUpdateDownState(item, 'queue')
        }
      }
      if (gids.length) await batchResumeTasks(gids)
      this.mRefreshListDataShow(true)
    },

    async batchRemoveSelected(): Promise<void> {
      const gids: string[] = []
      const downIDs: string[] = [...this.ListSelected]
      for (const downID of downIDs) {
        const item = this.ListDataRaw.find((d) => d.DownID === downID)
        if (item && item.Info.GID) gids.push(item.Info.GID)
      }
      if (gids.length) await batchRemoveTasks(gids)
      await this.mDeleteDowning(downIDs)
    }
  }
})

export default useDowningStore
