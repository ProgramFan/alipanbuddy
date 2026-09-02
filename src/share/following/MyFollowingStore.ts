import { defineStore } from 'pinia'
import { IAliMyFollowingModel } from '../../aliapi/alimodels'
import { HanToPin } from '../../utils/utils'
import { createSelectableListActions, createSelectableListGetters, createSelectableListState, SelectableListConfig, SelectableListState } from '../../store/selectableList'

type Item = IAliMyFollowingModel

export interface MyFollowingState extends SelectableListState<Item> {
  FollowingKeys: Set<string>
}

type State = MyFollowingState

const listConfig: SelectableListConfig<Item> = {
  keyField: 'user_id',
  emptyKey: '',
  defaultOrderKey: 'time desc',
  searchKeys: ['nick_name', 'SearchName', 'description'],
  searchScore: (a) => Math.max(a[0] ? a[0].score : -200000, a[1] ? a[1].score : -200000, a[2] ? a[2].score - 100 : -200000)
}

const useMyFollowingStore = defineStore('myfollowing', {
  state: (): State => ({
    ...createSelectableListState(listConfig),
    FollowingKeys: new Set<string>()
  }),

  getters: {
    ...createSelectableListGetters<State>()
  },

  actions: {
    ...createSelectableListActions(listConfig),

    aLoadListData(list: Item[]) {
      list.sort((a, b) => b.latest_messages[0].created - a.latest_messages[0].created)
      let item: Item
      for (let i = 0, maxi = list.length; i < maxi; i++) {
        item = list[i]
        item.SearchName = HanToPin(item.nick_name)
      }
      this.ListDataRaw = list

      const oldSelected = this.ListSelected
      const newSelected = new Set<string>()
      const map = new Set<string>()
      let key = ''
      let findFocusKey = false
      let findSelectKey = false
      let listFocusKey = this.ListFocusKey
      let listSelectKey = this.ListSelectKey
      for (let i = 0, maxi = list.length; i < maxi; i++) {
        key = list[i].user_id
        if (oldSelected.has(key)) newSelected.add(key)
        if (key == listFocusKey) findFocusKey = true
        if (key == listSelectKey) findSelectKey = true
        map.add(key)
      }
      if (!findFocusKey) listFocusKey = ''
      if (!findSelectKey) listSelectKey = ''

      this.$patch({ FollowingKeys: map, ListSelected: newSelected, ListFocusKey: listFocusKey, ListSelectKey: listSelectKey, ListSearchKey: '' })
      this.mRefreshListDataShow(true)
    },

    mSetFollowing(followingid: string, isFollowing: boolean) {
      if (isFollowing) this.FollowingKeys.add(followingid)
      else if (this.FollowingKeys.has(followingid)) this.FollowingKeys.delete(followingid)

      if (!isFollowing) {
        const listNew: Item[] = []
        const listOld = this.ListDataRaw
        for (let i = 0, maxi = listOld.length; i < maxi; i++) {
          if (listOld[i].user_id !== followingid) {
            listNew.push(listOld[i])
          }
        }
        if (listNew.length != listOld.length) {
          this.ListDataRaw = listNew
          this.mRefreshListDataShow(true)
        }
        if (this.ListSelected.has(followingid)) this.ListSelected.delete(followingid)
      }
    }
  }
})

export default useMyFollowingStore
