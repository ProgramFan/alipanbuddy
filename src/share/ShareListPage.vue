<script setup lang="ts">
import { ref } from 'vue'
import { KeyboardState, MouseState, useAppStore, useKeyboardStore, useMouseStore, useWinStore } from '../store'
import { KeyboardMessage } from '../store/keyboardstore'
import { onHideRightMenuScroll, onShowRightMenu, TestCtrl, TestKey, TestKeyboardScroll, TestKeyboardSelect } from '../utils/keyboardhelper'
import { TestButton } from '../utils/mosehelper'
import { ArrayXorWith } from '../utils/utils'
import { t } from '../i18n'

/** 五个分享列表页共用的 store 接口，由 src/store/selectableList.ts 的工厂生成 */
interface ShareListStore {
  ListLoading: boolean
  ListDataShow: any[]
  ListSelected: Set<string>
  ListFocusKey: string
  ListSearchKey: string
  ListDataSelectCountInfo: string
  IsListSelectedAll: boolean

  mSelectAll(): void

  mMouseSelect(key: string, ctrl: boolean, shift: boolean): void

  mRangSelect(lastkey: string, keyList: string[]): void

  mSearchListData(value: string): void

  mRefreshListDataShow(refreshRaw: boolean): void

  GetSelected(): any[]
}

const props = withDefaults(
  defineProps<{
    /** 列表 store（src/store/selectableList.ts 生成的公共接口） */
    store: ShareListStore
    /** appStore.GetAppTabMenu 的值，用来隔离键盘快捷键 */
    menu: string
    /** 右键菜单的元素 id，必须登记在 keyboardhelper 的 menulist 里 */
    menuId: string
    /** 左上角标题 */
    title: string
    /** 列表为空时的提示 */
    empty: string
    /** 列表项主键字段 */
    keyField?: string
    /** 是否显示区间选择 / 反选 / 取消已选 */
    rangeSelect?: boolean
    /** 加载时是否给列表盖上 loading 遮罩 */
    showLoading?: boolean
    /** 回车键的处理函数（传给 TestKeyboardSelect） */
    enterFun?: (key: string) => void
    /** 页面自己的快捷键，返回 true 表示已处理 */
    shortcuts?: (event: KeyboardMessage) => boolean
  }>(),
  { keyField: 'share_id', rangeSelect: true, showLoading: false, enterFun: undefined, shortcuts: undefined }
)

const emit = defineEmits<{ (e: 'refresh'): void }>()

const viewlist = ref()
const inputsearch = ref()

const appStore = useAppStore()
const winStore = useWinStore()

const itemKey = (item: any): string => item[props.keyField]
const handleRefresh = () => emit('refresh')
const focusSearch = () => inputsearch.value.focus()

const keyboardStore = useKeyboardStore()
keyboardStore.$subscribe((_m: any, state: KeyboardState) => {
  if (appStore.appTab != 'share' || appStore.GetAppTabMenu != props.menu) return
  const event = state.KeyDownEvent

  if (TestCtrl('a', event, () => props.store.mSelectAll())) return
  if (props.shortcuts && props.shortcuts(event)) return
  if (TestCtrl('f', event, focusSearch)) return
  if (TestKey('f3', event, focusSearch)) return
  if (TestKey(' ', event, focusSearch)) return
  if (TestKey('f5', event, handleRefresh)) return

  if (TestKeyboardSelect(event, viewlist.value, props.store, props.enterFun)) return
  if (TestKeyboardScroll(event, viewlist.value, props.store)) return
})

const mouseStore = useMouseStore()
mouseStore.$subscribe((_m: any, state: MouseState) => {
  if (appStore.appTab != 'share') return
  const mouseEvent = state.MouseEvent
  TestButton(0, mouseEvent, () => {
    const srcElement = mouseEvent.srcElement as any
    if (srcElement && srcElement.className && srcElement.className.toString().startsWith('arco-virtual-list')) {
      onSelectCancel()
    }
  })
})

const rangIsSelecting = ref(false)
const rangSelectID = ref('')
const rangSelectStart = ref('')
const rangSelectEnd = ref('')
const rangSelectFiles = ref<{ [k: string]: any }>({})
const rangClear = () => {
  rangSelectID.value = ''
  rangSelectStart.value = ''
  rangSelectEnd.value = ''
  rangSelectFiles.value = {}
}
const rangClass = (key: string) => (rangSelectFiles.value[key] ? (rangSelectStart.value == key ? 'rangstart' : rangSelectEnd.value == key ? 'rangend' : 'rang') : '')
/** 在 ListDataShow 里找到两个主键的下标，返回从小到大排好的一对 */
const rangIndexes = (key1: string, key2: string) => {
  const children = props.store.ListDataShow
  let a = -1
  let b = -1
  for (let i = 0, maxi = children.length; i < maxi; i++) {
    if (itemKey(children[i]) == key1) a = i
    if (itemKey(children[i]) == key2) b = i
    if (a > 0 && b > 0) break
  }
  return { a, b, children }
}

const onSelectRangStart = () => {
  onHideRightMenuScroll()
  rangIsSelecting.value = !rangIsSelecting.value
  rangClear()
  props.store.mRefreshListDataShow(false)
}
const onSelectCancel = () => {
  onHideRightMenuScroll()
  props.store.ListSelected.clear()
  props.store.ListFocusKey = ''
  props.store.mRefreshListDataShow(false)
}
const onSelectReverse = () => {
  onHideRightMenuScroll()
  const listData = props.store.ListDataShow
  const listSelected = props.store.GetSelected()
  const reverseSelect = ArrayXorWith(listData, listSelected, (a, b) => itemKey(a) === itemKey(b))
  props.store.ListSelected.clear()
  props.store.ListFocusKey = ''
  if (reverseSelect.length > 0) {
    props.store.mRangSelect(itemKey(reverseSelect[0]), reverseSelect.map(itemKey))
  }
  props.store.mRefreshListDataShow(false)
}
const onSelectRang = (key: string) => {
  if (rangIsSelecting.value && rangSelectID.value != '') {
    let startid = rangSelectID.value
    let endid = ''
    const s: { [k: string]: any } = {}
    const { a, b, children } = rangIndexes(key, startid)
    if (a >= 0 && b >= 0) {
      let [min, max] = [a, b]
      if (a > b) {
        ;[min, max] = [b, a]
        endid = key
      } else {
        endid = startid
        startid = key
      }
      for (let n = min; n <= max; n++) {
        s[itemKey(children[n])] = true
      }
    }
    rangSelectStart.value = startid
    rangSelectEnd.value = endid
    rangSelectFiles.value = s
    props.store.mRefreshListDataShow(false)
  }
}

const handleSelect = (key: string, event: any, isCtrl: boolean = false) => {
  onHideRightMenuScroll()
  if (rangIsSelecting.value) {
    if (!rangSelectID.value) {
      if (!props.store.ListSelected.has(key)) {
        props.store.mMouseSelect(key, true, false)
      }
      rangSelectID.value = key
      rangSelectStart.value = key
      rangSelectFiles.value = { [key]: true }
    } else {
      const { a, b, children } = rangIndexes(key, rangSelectID.value)
      const fileList: string[] = []
      if (a >= 0 && b >= 0) {
        const [min, max] = a > b ? [b, a] : [a, b]
        for (let n = min; n <= max; n++) {
          fileList.push(itemKey(children[n]))
        }
      }
      props.store.mRangSelect(key, fileList)
      rangIsSelecting.value = false
      rangClear()
    }
    props.store.mRefreshListDataShow(false)
  } else {
    props.store.mMouseSelect(key, event.ctrlKey || isCtrl, event.shiftKey)
    if (!props.store.ListSelected.has(key)) {
      props.store.ListFocusKey = ''
    }
  }
}

const handleSearchInput = (value: string) => {
  props.store.mSearchListData(value)
  viewlist.value.scrollIntoView(0)
}
const handleSearchEnter = (event: any) => {
  event.target.blur()
  viewlist.value.scrollIntoView(0)
}
const handleRightClick = (event: MouseEvent, key: string) => {
  if (!props.store.ListSelected.has(key)) props.store.mMouseSelect(key, false, false)
  onShowRightMenu(props.menuId, event.clientX, event.clientY)
}
</script>

<template>
  <div style="height: 7px"></div>
  <div class="toppanbtns" style="height: 26px">
    <div style="min-height: 26px; max-width: 100%; flex-shrink: 0; flex-grow: 0">
      <div class="toppannav">
        <div class="toppannavitem" :title="title">
          <span> {{ title }} </span>
        </div>
      </div>
    </div>
    <div class="flex flexauto"></div>
    <div v-if="$slots.stats" class="toppanbtns" style="height: 26px;min-width: fit-content">
      <div class="flex flexauto"></div>
      <slot name="stats" />
    </div>
  </div>
  <div style="height: 14px"></div>
  <div class="toppanbtns" style="height: 26px">
    <div class="toppanbtn">
      <a-button type="text" size="small" tabindex="-1" :loading="store.ListLoading" title="F5" @click="handleRefresh">
        <template #icon><IconFont name="iconreload-1-icon" />
        </template>
        {{ t('user.refresh') }}
      </a-button>
    </div>
    <slot name="buttons" />
    <div style="flex-grow: 1"></div>
    <div class="toppanbtn">
      <a-input-search ref="inputsearch" tabindex="-1"
                      size="small" title="Ctrl+F / F3 / Space"
                      :placeholder="t('share.quickFilter')"
                      allow-clear @clear='(e:any)=>handleSearchInput("")'
                      v-model="store.ListSearchKey"
                      @input="(val:any)=>handleSearchInput(val as string)"
                      @press-enter="handleSearchEnter"
                      @keydown.esc=";($event.target as any).blur()" />
    </div>
    <div></div>
  </div>
  <div style="height: 9px"></div>
  <div class="toppanarea">
    <div style="margin: 0 3px">
      <a-tooltip mini :content="t('share.selectAll')" position="left">
        <a-button shape="circle" type="text" tabindex="-1" class="select all" title="Ctrl+A" @click="store.mSelectAll()">
          <IconFont :name="store.IsListSelectedAll ? 'iconrsuccess' : 'iconpic2'" />
        </a-button>
      </a-tooltip>
      <div class='selectInfo'>{{ store.ListDataSelectCountInfo }}</div>
      <div v-if="rangeSelect" style='margin: 0 2px'>
        <a-tooltip mini position='rt' v-if="store.ListDataShow.length > 0">
          <a-button shape='square' type='text' tabindex='-1' class='qujian'
                    :status="rangIsSelecting ? 'danger' : 'normal'" title='Ctrl+Q' @click='onSelectRangStart'>
            {{ rangIsSelecting ? t('share.cancelSelect') : t('share.rangeSelect') }}
          </a-button>
          <template #content>
            <div>
              {{ t('share.rangeStep1') }}
              <br />
              {{ t('share.rangeStep2') }}
              <br />
              {{ t('share.rangeStep3') }}
            </div>
          </template>
        </a-tooltip>
        <a-button shape='square'
                  v-if='!rangIsSelecting && store.ListSelected.size > 0 && store.ListSelected.size < store.ListDataShow.length'
                  type='text'
                  tabindex='-1'
                  class='qujian'
                  status='normal' @click='onSelectReverse'>
          {{ t('share.reverseSelect') }}
        </a-button>
        <a-button shape='square' v-if='!rangIsSelecting && store.ListSelected.size > 0' type='text'
                  tabindex='-1' class='qujian'
                  status='normal' @click='onSelectCancel'>
          {{ t('share.cancelSelectedItems') }}
        </a-button>
      </div>
    </div>
    <div style="flex-grow: 1"></div>
    <slot name="columns" />
    <div class="cell pr"></div>
  </div>
  <div class="toppanlist" @keydown.space.prevent="() => true">
    <a-list
      ref="viewlist"
      :bordered="false"
      :split="false"
      :max-height="winStore.GetListHeightNumber"
      :virtual-list-props="{
        height: winStore.GetListHeightNumber,
        fixedSize: true,
        estimatedSize: 50,
        threshold: 1,
        itemKey: keyField
      }"
      style="width: 100%"
      :data="store.ListDataShow"
      :loading="showLoading && store.ListLoading"
      tabindex="-1"
      @scroll="onHideRightMenuScroll">
      <template #empty>
        <a-empty :description="empty" />
      </template>

      <template #item="{ item, index }">
        <div :key="itemKey(item)" class="listitemdiv">
          <div
            :class="'fileitem' + (store.ListSelected.has(itemKey(item)) ? ' selected' : '') + (store.ListFocusKey == itemKey(item) ? ' focus' : '')"
            @click="handleSelect(itemKey(item), $event)"
            @mouseover='onSelectRang(itemKey(item))'
            @contextmenu="(event:MouseEvent)=>handleRightClick(event, itemKey(item))">
            <div :class="rangeSelect ? 'rangselect ' + rangClass(itemKey(item)) : ''" :style="rangeSelect ? '' : 'margin: 2px'">
              <a-button shape="circle" type="text" tabindex="-1" class="select" :title="index"
                        @click.prevent.stop="handleSelect(itemKey(item), $event, true)">
                <IconFont :name="store.ListSelected.has(itemKey(item)) ? 'iconrsuccess' : 'iconpic2'" />
              </a-button>
            </div>
            <slot name="row" :item="item" :index="index" />
          </div>
        </div>
      </template>
    </a-list>
    <a-dropdown :id="menuId" class="rightmenu" :popup-visible="true"
                style="z-index: -1; left: -200px; opacity: 0">
      <template #content>
        <slot name="menu" />
      </template>
    </a-dropdown>
  </div>
  <slot />
</template>

<style></style>
