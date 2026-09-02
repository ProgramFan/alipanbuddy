import fuzzysort from 'fuzzysort'
import { GetFocusNext, GetSelectedList, KeyboardSelectOne, MouseSelectOne, SelectAll } from '../utils/selecthelper'
import { t } from '../i18n'

/** fuzzysort 阈值，低于该分数的结果直接丢弃 */
const SEARCH_THRESHOLD = -200000

/** T 里值类型为 K 的字段名，用作列表项主键字段 */
type SelectableListKeyField<T, K> = Extract<{ [P in keyof T]: T[P] extends K ? P : never }[keyof T], string>

/** 多选列表最小 state：只够 createSelectionActions 使用 */
export interface SelectionState<T, K extends string | number = string> {
  ListDataShow: T[]
  ListSelected: Set<K>
  ListFocusKey: K
  ListSelectKey: K
}

/** 所有“可多选列表”store 共享的 state */
export interface SelectableListState<T, K extends string | number = string, O = string> extends SelectionState<T, K> {
  ListLoading: boolean
  ListDataRaw: T[]
  ListOrderKey: O
  ListSearchKey: string
}

export interface SelectionConfig<T, K extends string | number = string> {
  /** 主键字段名（例如 share_id / DownID / TaskID），可传函数以支持运行时切换 */
  keyField: SelectableListKeyField<T, K> | (() => SelectableListKeyField<T, K>)
  /** 主键的“空值”，字符串主键用 ''，数字主键用 0 */
  emptyKey: K
}

export interface SelectableListConfig<T, K extends string | number = string, O = string> extends SelectionConfig<T, K> {
  /** ListOrderKey 的初始值 */
  defaultOrderKey: O
  /** fuzzysort 的搜索字段 */
  searchKeys: readonly string[]
  /** 自定义 fuzzysort 打分，默认取前两个字段的最高分 */
  searchScore?: (keysResult: ReadonlyArray<{ score: number }>) => number
  /** aLoadListData 时对每一项做的预处理（拼音、别名字段等） */
  prepareItem?: (item: T) => void
  /** aLoadListData 时是否保留原来的焦点/选择锚点，默认 true */
  preserveFocusOnLoad?: boolean
  /** mDeleteFiles 没删掉任何一项时是否仍然刷新，默认 false */
  alwaysRefreshOnDelete?: boolean
}

/** 选择相关 action 内部用到的 store 成员（真正的 this 由 pinia 注入） */
export interface SelectionStoreThis<T, K extends string | number> extends SelectionState<T, K> {
  $patch(partialState: Record<string, unknown>): void

  mRefreshListDataShow(refreshRaw: boolean): void
}

/** 列表 action 内部用到的 store 成员 */
export interface SelectableListStoreThis<T, K extends string | number, O> extends SelectionStoreThis<T, K>, SelectableListState<T, K, O> {
  mGetOrder(order: O, list: T[]): T[]
}

interface SelectionStateLike {
  ListSelected: Set<any>
  ListDataShow: unknown[]
}

/** 供 state() 使用：生成一份全新的共享 state */
export function createSelectableListState<T, K extends string | number = string, O = string>(config: SelectableListConfig<T, K, O>): SelectableListState<T, K, O> {
  return {
    ListLoading: false,
    ListDataRaw: [],
    ListDataShow: [],
    ListSelected: new Set<K>(),
    ListOrderKey: config.defaultOrderKey,
    ListFocusKey: config.emptyKey,
    ListSelectKey: config.emptyKey,
    ListSearchKey: ''
  }
}

/** 选择相关的 getters（不含 ListDataCount，供把 ListDataCount 放进 state 的 store 使用） */
export function createSelectionGetters<S extends SelectionStateLike>() {
  return {
    IsListSelected(state: S): boolean {
      return state.ListSelected.size > 0
    },
    ListSelectedCount(state: S): number {
      return state.ListSelected.size
    },
    ListDataSelectCountInfo(state: S): string {
      return t('transfer.selectedCount', { selected: state.ListSelected.size, total: state.ListDataShow.length })
    },
    IsListSelectedAll(state: S): boolean {
      return state.ListSelected.size > 0 && state.ListSelected.size == state.ListDataShow.length
    }
  }
}

/** 选择相关的 getters + ListDataCount */
export function createSelectableListGetters<S extends SelectionStateLike>() {
  return {
    ListDataCount(state: S): number {
      return state.ListDataShow.length
    },
    ...createSelectionGetters<S>()
  }
}

/** 主键字段名 / 主键取值 的访问器（keyField 可以是运行时才确定的函数） */
function createKeyAccessor<T, K extends string | number>(config: SelectionConfig<T, K>) {
  const fieldOf = typeof config.keyField == 'function' ? config.keyField : () => config.keyField as SelectableListKeyField<T, K>
  const keyOf = (item: T): K => (item as any)[fieldOf()] as K
  return { fieldOf, keyOf }
}

/** 全选 / 鼠标键盘多选 / 焦点 相关的 actions，只依赖 ListDataShow + ListSelected */
export function createSelectionActions<T, K extends string | number = string>(config: SelectionConfig<T, K>) {
  const { emptyKey } = config
  const { fieldOf, keyOf } = createKeyAccessor(config)

  type This = SelectionStoreThis<T, K>

  return {
    mSelectAll(this: This) {
      this.$patch({ ListSelected: SelectAll(this.ListDataShow, fieldOf(), this.ListSelected), ListFocusKey: emptyKey, ListSelectKey: emptyKey })
      this.mRefreshListDataShow(false)
    },

    mMouseSelect(this: This, key: K, Ctrl: boolean, Shift: boolean) {
      if (this.ListDataShow.length == 0) return
      const data = MouseSelectOne(this.ListDataShow, fieldOf(), this.ListSelected, this.ListFocusKey, this.ListSelectKey, key, Ctrl, Shift, emptyKey)
      this.$patch({ ListSelected: data.selectedNew, ListFocusKey: data.focusLast, ListSelectKey: data.selectedLast })
      this.mRefreshListDataShow(false)
    },

    mKeyboardSelect(this: This, key: K, Ctrl: boolean, Shift: boolean) {
      if (this.ListDataShow.length == 0) return
      const data = KeyboardSelectOne(this.ListDataShow, fieldOf(), this.ListSelected, this.ListFocusKey, this.ListSelectKey, key, Ctrl, Shift, emptyKey)
      this.$patch({ ListSelected: data.selectedNew, ListFocusKey: data.focusLast, ListSelectKey: data.selectedLast })
      this.mRefreshListDataShow(false)
    },

    mRangSelect(this: This, lastkey: K, file_idList: K[]) {
      if (this.ListDataShow.length == 0) return
      const selectedNew = new Set<K>(this.ListSelected)
      for (let i = 0, maxi = file_idList.length; i < maxi; i++) {
        selectedNew.add(file_idList[i])
      }
      this.$patch({ ListSelected: selectedNew, ListFocusKey: lastkey, ListSelectKey: lastkey })
      this.mRefreshListDataShow(false)
    },

    GetSelected(this: This): T[] {
      return GetSelectedList(this.ListDataShow, fieldOf(), this.ListSelected)
    },

    GetSelectedFirst(this: This): T | undefined {
      const list = GetSelectedList(this.ListDataShow, fieldOf(), this.ListSelected)
      if (list.length > 0) return list[0]
      return undefined
    },

    mSetFocus(this: This, key: K) {
      this.ListFocusKey = key
      this.mRefreshListDataShow(false)
    },

    mGetFocus(this: This): K {
      if (!this.ListFocusKey && this.ListDataShow.length > 0) return keyOf(this.ListDataShow[0])
      return this.ListFocusKey
    },

    mGetFocusNext(this: This, position: string): K {
      return GetFocusNext<K>(this.ListDataShow, fieldOf(), this.ListFocusKey, position, emptyKey)
    }
  }
}

/**
 * 共享的列表 actions：加载 / 搜索 / 排序 / 刷新 / 多选 / 焦点 / 删除。
 * store 需要不同实现时，在自己的 actions 里重写同名方法即可（写在展开之后的会覆盖）。
 */
export function createSelectableListActions<T, K extends string | number = string, O = string>(config: SelectableListConfig<T, K, O>) {
  const { emptyKey, searchKeys, prepareItem } = config
  const { keyOf } = createKeyAccessor(config)
  const preserveFocusOnLoad = config.preserveFocusOnLoad !== false
  const alwaysRefreshOnDelete = config.alwaysRefreshOnDelete === true
  const scoreFn = config.searchScore || ((a: ReadonlyArray<{ score: number }>) => Math.max(a[0] ? a[0].score : SEARCH_THRESHOLD, a[1] ? a[1].score : SEARCH_THRESHOLD))

  type This = SelectableListStoreThis<T, K, O>

  return {
    ...createSelectionActions<T, K>(config),

    aLoadListData(this: This, list: T[], count?: number) {
      if (prepareItem) {
        for (let i = 0, maxi = list.length; i < maxi; i++) {
          prepareItem(list[i])
        }
      }
      this.ListDataRaw = this.mGetOrder(this.ListOrderKey, list)

      const oldSelected = this.ListSelected
      const newSelected = new Set<K>()
      let listFocusKey = preserveFocusOnLoad ? this.ListFocusKey : emptyKey
      let listSelectKey = preserveFocusOnLoad ? this.ListSelectKey : emptyKey
      let findFocusKey = false
      let findSelectKey = false
      let key: K
      for (let i = 0, maxi = list.length; i < maxi; i++) {
        key = keyOf(list[i])
        if (oldSelected.has(key)) newSelected.add(key)
        if (key == listFocusKey) findFocusKey = true
        if (key == listSelectKey) findSelectKey = true
      }
      if (!findFocusKey) listFocusKey = emptyKey
      if (!findSelectKey) listSelectKey = emptyKey

      const patch: Record<string, unknown> = { ListSelected: newSelected, ListFocusKey: listFocusKey, ListSelectKey: listSelectKey, ListSearchKey: '' }
      if (count !== undefined) patch.ListDataCount = count
      this.$patch(patch)
      this.mRefreshListDataShow(true)
    },

    mSearchListData(this: This, value: string) {
      this.$patch({ ListSelected: new Set<K>(), ListFocusKey: emptyKey, ListSelectKey: emptyKey, ListSearchKey: value })
      this.mRefreshListDataShow(true)
    },

    mOrderListData(this: This, value: O) {
      this.$patch({ ListOrderKey: value, ListSelected: new Set<K>(), ListFocusKey: emptyKey, ListSelectKey: emptyKey })
      this.ListDataRaw = this.mGetOrder(value, this.ListDataRaw)
      this.mRefreshListDataShow(true)
    },

    /** 默认不排序，需要排序的 store 重写本方法 */
    mGetOrder(_order: O, list: T[]): T[] {
      return list
    },

    /**
     * 刷新显示的列表数据
     * @param refreshRaw 是否从原始数据中刷新显示
     */
    mRefreshListDataShow(this: This, refreshRaw: boolean) {
      if (!refreshRaw) {
        const listDataShow = this.ListDataShow.concat()
        Object.freeze(listDataShow)
        this.ListDataShow = listDataShow
        return
      }
      if (this.ListSearchKey) {
        const searchList: T[] = []
        const results = fuzzysort.go(this.ListSearchKey, this.ListDataRaw, { threshold: SEARCH_THRESHOLD, keys: searchKeys, scoreFn })
        for (let i = 0, maxi = results.length; i < maxi; i++) {
          if (results[i].score > SEARCH_THRESHOLD) searchList.push(results[i].obj)
        }
        Object.freeze(searchList)
        this.ListDataShow = searchList
      } else {
        const listDataShow = this.ListDataRaw.concat()
        Object.freeze(listDataShow)
        this.ListDataShow = listDataShow
      }

      const freezeList = this.ListDataShow
      const oldSelected = this.ListSelected
      const newSelected = new Set<K>()
      let key: K
      for (let i = 0, maxi = freezeList.length; i < maxi; i++) {
        key = keyOf(freezeList[i])
        if (oldSelected.has(key)) newSelected.add(key)
      }
      this.ListSelected = newSelected
    },

    mDeleteFiles(this: This, keyList: K[]) {
      const fileMap = new Set<K>(keyList)
      const listDataRaw = this.ListDataRaw
      const newDataList: T[] = []
      for (let i = 0, maxi = listDataRaw.length; i < maxi; i++) {
        const item = listDataRaw[i]
        if (!fileMap.has(keyOf(item))) {
          newDataList.push(item)
        }
      }
      if (alwaysRefreshOnDelete || listDataRaw.length != newDataList.length) {
        this.ListDataRaw = newDataList
        this.mRefreshListDataShow(true)
      }
    }
  }
}
