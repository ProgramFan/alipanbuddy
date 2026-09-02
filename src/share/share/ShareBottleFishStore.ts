import { defineStore } from 'pinia'
import { IAliShareBottleFishItem } from '../../aliapi/alimodels'
import { HanToPin } from '../../utils/utils'
import { createSelectableListActions, createSelectableListGetters, createSelectableListState, SelectableListConfig, SelectableListState } from '../../store/selectableList'

type Item = IAliShareBottleFishItem

type ShareBottleFishState = SelectableListState<Item>

type State = ShareBottleFishState

const listConfig: SelectableListConfig<Item> = {
  keyField: 'shareId',
  emptyKey: '',
  defaultOrderKey: 'mtime',
  searchKeys: ['share_name', 'display_name'],
  prepareItem: (item) => {
    item.share_name = item.name
    item.display_name = HanToPin(item.name)
  }
}

const useShareBottleFishStore = defineStore('sharebottlefish', {
  state: (): State => createSelectableListState(listConfig),

  getters: {
    ...createSelectableListGetters<State>(),

    ListStats(state: State) {
      const stats = { saved: 0 }
      const list = state.ListDataShow
      let item: Item
      for (let i = 0, maxi = list.length; i < maxi; i++) {
        item = list[i]
        if (item.saved) {
          stats.saved++
        }
      }
      return stats
    }
  },

  actions: {
    ...createSelectableListActions(listConfig),

    mGetOrder(order: string, list: Item[]) {
      if (order == 'mtime') list.sort((a, b) => new Date(b.gmtCreate).getTime() - new Date(a.gmtCreate).getTime())
      return list
    }
  }
})

export default useShareBottleFishStore
