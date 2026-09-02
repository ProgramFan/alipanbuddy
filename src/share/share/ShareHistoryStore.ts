import { defineStore } from 'pinia'
import { IAliShareRecentItem } from '../../aliapi/alimodels'
import { HanToPin } from '../../utils/utils'
import { createSelectableListActions, createSelectableListGetters, createSelectableListState, SelectableListConfig, SelectableListState } from '../../store/selectableList'

type Item = IAliShareRecentItem

type ShareHistoryState = SelectableListState<Item>

type State = ShareHistoryState

const listConfig: SelectableListConfig<Item> = {
  keyField: 'share_id',
  emptyKey: '',
  defaultOrderKey: 'mtime',
  searchKeys: ['share_name', 'display_name'],
  prepareItem: (item) => {
    item.display_name = HanToPin(item.share_name)
  }
}

const useShareHistoryStore = defineStore('sharehistory', {
  state: (): State => createSelectableListState(listConfig),

  getters: {
    ...createSelectableListGetters<State>(),

    ListStats(state: State) {
      const stats = { preview: 0, browse: 0, save: 0, previewMax: 0, forbidden: 0 }
      const list = state.ListDataShow
      let item: Item
      for (let i = 0, maxi = list.length; i < maxi; i++) {
        item = list[i]
        stats.preview += item.preview_count
        stats.previewMax = Math.max(stats.previewMax, item.preview_count)
        stats.browse += item.browse_count
        stats.save += item.save_count
        if (item.status == 'forbidden') stats.forbidden++
      }
      return stats
    }
  },

  actions: {
    ...createSelectableListActions(listConfig),

    mGetOrder(order: string, list: Item[]) {
      if (order == 'ctime') list.sort((a, b) => new Date(b.gmt_created).getTime() - new Date(a.gmt_created).getTime())
      if (order == 'mtime') list.sort((a, b) => new Date(b.gmt_modified).getTime() - new Date(a.gmt_modified).getTime())
      if (order == 'preview') list.sort((a, b) => b.preview_count - a.preview_count)
      if (order == 'browse') list.sort((a, b) => b.browse_count - a.browse_count)
      if (order == 'save') list.sort((a, b) => b.save_count - a.save_count)
      return list
    }
  }
})

export default useShareHistoryStore
