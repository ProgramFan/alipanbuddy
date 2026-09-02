import { defineStore } from 'pinia'
import { HanToPin } from '../../utils/utils'
import { createSelectableListActions, createSelectableListGetters, createSelectableListState, SelectableListConfig, SelectableListState } from '../../store/selectableList'

export interface IOtherShareLinkModel {
  share_id: string
  share_name: string
  description: string
  share_pwd: string
  expiration: string
  expired: boolean
  share_msg: string
  created_at: string
  updated_at: string
  saved_at: string
  saved_time: number
}

type Item = IOtherShareLinkModel

type OtherShareState = SelectableListState<Item>

type State = OtherShareState

const listConfig: SelectableListConfig<Item> = {
  keyField: 'share_id',
  emptyKey: '',
  defaultOrderKey: 'time',
  searchKeys: ['share_name', 'description'],
  prepareItem: (item) => {
    item.description = HanToPin(item.share_name)
  },
  alwaysRefreshOnDelete: true
}

const useOtherShareStore = defineStore('othershare', {
  state: (): State => createSelectableListState(listConfig),

  getters: {
    ...createSelectableListGetters<State>()
  },

  actions: {
    ...createSelectableListActions(listConfig),

    mGetOrder(order: string, list: Item[]) {
      if (order == 'state') list.sort((a, b) => a.share_msg.localeCompare(b.share_msg))
      if (order == 'update') list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      if (order == 'time') list.sort((a, b) => b.saved_time - a.saved_time)
      return list
    }
  }
})

export default useOtherShareStore
