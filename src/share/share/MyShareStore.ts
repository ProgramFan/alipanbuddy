import { defineStore } from 'pinia'
import { IAliShareItem } from '../../aliapi/alimodels'
import { HanToPin } from '../../utils/utils'
import { UpdateShareModel } from '../../aliapi/share'
import { humanExpiration } from '../../utils/format'
import { createSelectableListActions, createSelectableListGetters, createSelectableListState, SelectableListConfig, SelectableListState } from '../../store/selectableList'

type Item = IAliShareItem

type MyShareState = SelectableListState<Item>

type State = MyShareState

const listConfig: SelectableListConfig<Item> = {
  keyField: 'share_id',
  emptyKey: '',
  defaultOrderKey: 'time',
  searchKeys: ['share_name', 'description'],
  prepareItem: (item) => {
    item.description = HanToPin(item.share_name)
  }
}

const useMyShareStore = defineStore('myshare', {
  state: (): State => createSelectableListState(listConfig),

  getters: {
    ...createSelectableListGetters<State>(),

    ListStats(state: State) {
      const stats = { preview: 0, download: 0, save: 0, previewMax: 0, forbidden: 0, expired: 0, expir2day: 0 }
      const list = state.ListDataShow
      let item: Item
      const day = new Date().getTime()
      for (let i = 0, maxi = list.length; i < maxi; i++) {
        item = list[i]
        stats.preview += item.preview_count
        stats.previewMax = Math.max(stats.previewMax, item.preview_count)
        stats.download += item.download_count
        stats.save += item.save_count
        if (item.status == 'forbidden') stats.forbidden++
        if (item.expired) stats.expired++
        else if (new Date(item.expiration).getTime() - day < 2 * 24 * 60 * 60 * 1000) stats.expir2day++
      }
      return stats
    }
  },

  actions: {
    ...createSelectableListActions(listConfig),

    mGetOrder(order: string, list: Item[]) {
      if (order == 'time') list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      if (order == 'preview') list.sort((a, b) => b.preview_count - a.preview_count)
      if (order == 'download') list.sort((a, b) => b.download_count - a.download_count)
      if (order == 'save') list.sort((a, b) => b.save_count - a.save_count)
      if (order == 'state')
        list.sort((a, b) => {
          const s = a.share_msg.localeCompare(b.share_msg)
          if (s == 0) {
            if (a.first_file && b.first_file) return 0
            if (a.first_file) return 1
            if (b.first_file) return -1
            return 0
          }
          return s
        })
      return list
    },

    mUpdateShare(success: UpdateShareModel[]) {
      const listDataRaw = this.ListDataRaw
      const timeNow = new Date().getTime()
      for (let j = 0, jmax = success.length; j < jmax; j++) {
        const info = success[j]
        for (let i = 0, maxi = listDataRaw.length; i < maxi; i++) {
          const item = listDataRaw[i]
          if (item.share_id == info.share_id) {
            item.share_pwd = info.share_pwd
            item.share_name = info.share_name
            item.description = HanToPin(info.share_name)
            item.expiration = info.expiration
            item.share_msg = humanExpiration(info.expiration, timeNow)
            item.expired = item.share_msg == '过期失效'
            break
          }
        }
      }
      this.mRefreshListDataShow(false)
    }
  }
})

export default useMyShareStore
