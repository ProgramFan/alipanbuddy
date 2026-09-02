import { defineStore } from 'pinia'
import { IAliShareItem } from '../../aliapi/alimodels'
import { HanToPin } from '../../utils/utils'
import { createSelectableListActions, createSelectableListGetters, createSelectableListState, SelectableListConfig, SelectableListState } from '../../store/selectableList'

type Item = IAliShareItem

type MyTransferShareState = SelectableListState<Item>

type State = MyTransferShareState

const listConfig: SelectableListConfig<Item> = {
  keyField: 'share_id',
  emptyKey: '',
  defaultOrderKey: 'time',
  searchKeys: ['share_name', 'description'],
  prepareItem: (item) => {
    item.description = HanToPin(item.share_name)
  }
}

const useMyTransferShareStore = defineStore('myTransferShare', {
  state: (): State => createSelectableListState(listConfig),

  getters: {
    ...createSelectableListGetters<State>(),

    ListStats(state: State) {
      const stats = { forbidden: 0, expired: 0, expir2day: 0 }
      const list = state.ListDataShow
      let item: Item
      const day = new Date().getTime()
      for (let i = 0, maxi = list.length; i < maxi; i++) {
        item = list[i]
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
      if (order == 'time') {
        list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      } else if (order == 'state') {
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
      } else if (order == 'save') {
        list.sort((a, b) => {
          if (a.is_share_saved && b.is_share_saved) return 0
          if (a.is_share_saved) return 1
          if (b.is_share_saved) return -1
          return 0
        })
      }
      return list
    }
  }
})

export default useMyTransferShareStore
