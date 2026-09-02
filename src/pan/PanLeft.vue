<script setup lang='ts'>
import { computed, ref, watchEffect } from 'vue'

import usePanTreeStore, { PanTreeState } from './pantreestore'
import MySwitchTab from '../layout/MySwitchTab.vue'
import { KeyboardState, useAppStore, useKeyboardStore, usePanFileStore, useSettingStore, useWinStore } from '../store'
import PanDAL from './pandal'
import UserDAL from '../user/userdal'
import { onHideRightMenuScroll, onShowRightMenu, TestCtrl } from '../utils/keyboardhelper'
import DirLeftMenu from './menus/DirLeftMenu.vue'
import TreeStore, { TreeNodeData } from '../store/treestore'
import { dropMoveSelectedFile } from './topbtns/topbtn'
import message from '../utils/message'
import { modalUpload } from '../utils/modal'
import { getDriveType as GetDriveType } from '../drive/context'
import { t } from '../i18n'
import { quickFileId, type QuickFileEntry } from './quickFiles'

const treeref = ref()
const inputselectType = ref('backup')
const winStore = useWinStore()
const treeHeight = computed(() => winStore.height - 42 - 56 - 24 - 4)
const quickHeight = computed(() => winStore.height - 42 - 56 - 24 - 4 - 280 - 28)
const appStore = useAppStore()
const pantreeStore = usePanTreeStore()
const settingStore = useSettingStore()

const keyboardStore = useKeyboardStore()
keyboardStore.$subscribe((_m: any, state: KeyboardState) => {
  if (appStore.appTab != 'pan') return
  if (TestCtrl('1', state.KeyDownEvent, () => handleQuickSelect(1))) return
  if (TestCtrl('2', state.KeyDownEvent, () => handleQuickSelect(2))) return
  if (TestCtrl('3', state.KeyDownEvent, () => handleQuickSelect(3))) return
  if (TestCtrl('4', state.KeyDownEvent, () => handleQuickSelect(4))) return
  if (TestCtrl('5', state.KeyDownEvent, () => handleQuickSelect(5))) return
  if (TestCtrl('6', state.KeyDownEvent, () => handleQuickSelect(6))) return
  if (TestCtrl('7', state.KeyDownEvent, () => handleQuickSelect(7))) return
  if (TestCtrl('8', state.KeyDownEvent, () => handleQuickSelect(8))) return
  if (TestCtrl('9', state.KeyDownEvent, () => handleQuickSelect(9))) return
})

const switchValues = computed(() => [
  { key: 'wangpan', title: t('pan.files'), alt: '' },
  { key: 'kuaijie', title: t('pan.shortcuts'), alt: '' }
])

let DriveID = pantreeStore.drive_id
pantreeStore.$subscribe((_m: any, state: PanTreeState) => {
  if (state.drive_id != DriveID) {
    DriveID = state.drive_id
    inputselectType.value = GetDriveType(state.user_id, state.drive_id).name
  }
})

const colorTreeData = ref<TreeNodeData[]>([])
watchEffect(() => {
  const list = settingStore.uiFileColorArray
  const nodeList: TreeNodeData[] = []
  for (let i = 0; i < list.length; i++) {
    nodeList.push({
      __v_skip: true,
      key: 'color' + list[i].key.replace('#', 'c') + ' ' + (list[i].title || list[i].key),
      parent_file_id: '',
      title: list[i].title || list[i].key,
      namesearch: list[i].key.replace('#', 'c'),
      children: [],
      isLeaf: true
    } as TreeNodeData)
  }
  Object.freeze(nodeList)
  colorTreeData.value = nodeList
})
watchEffect(() => {
  const scrollToDir = pantreeStore.scrollToDir
  if (scrollToDir) treeref.value?.scrollIntoView({ key: scrollToDir, align: 'top' })
  pantreeStore.mSaveTreeScrollTo('')
})

const handleTreeRightClick = (event: MouseEvent, node: any) => {
  const key = String(node.key || '')
  if (key.startsWith('search')) return
  if (key.length < 40) return
  pantreeStore.mTreeSelected({ event, node })
  onShowRightMenu('leftpanmenu', event.clientX, event.clientY)
}

const onRowItemDragEnter = (ev: any) => {
  ev.stopPropagation()
  ev.preventDefault()
  ev.target.style.outline = '2px dotted #637dff'
  ev.target.style.background = 'rgba(var(--primary-6),0.3)'
  ev.dataTransfer.dropEffect = 'move'
}
const onRowItemDragLeave = (ev: any) => {
  ev.stopPropagation()
  ev.preventDefault()
  ev.target.style.outline = 'none'
  ev.target.style.background = ''
}
const onRowItemDragOver = (ev: any) => {
  ev.stopPropagation()
  ev.preventDefault()
}

const onQuickDragEnter = (ev: any) => {
  ev.stopPropagation()
  ev.preventDefault()
  ev.target.style.outline = '2px dotted #637dff'
  ev.target.style.background = 'rgba(var(--primary-6),0.3)'
  ev.dataTransfer.dropEffect = 'copy'
}

const onQuickDragOver = (ev: any) => {
  ev.stopPropagation()
  ev.preventDefault()
  ev.dataTransfer.dropEffect = 'copy'
}

const onRowItemDrop = (ev: any, data: any) => {
  ev.stopPropagation()
  ev.preventDefault()
  ev.target.style.outline = 'none'
  ev.target.style.background = ''
  const filesList = ev.dataTransfer.files
  if (filesList && filesList.length > 0) {
    const files: string[] = []
    for (let i = 0, maxi = filesList.length; i < maxi; i++) {
      const path = filesList[i].path
      files.push(path)
    }
    modalUpload(data.key, files)
  } else {
    dropMoveSelectedFile(data.drive_id, data.key, true)
  }
}

const onQuickDrop = (ev: any) => {
  ev.preventDefault()
  ev.target.style.outline = 'none'
  ev.target.style.background = ''

  const list: QuickFileEntry[] = []
  const selectedFile = usePanFileStore().GetSelected()
  for (let i = 0, maxi = selectedFile.length; i < maxi; i++) {
    if (selectedFile[i].isDir) {
      const item = selectedFile[i]
      const driveType = GetDriveType(pantreeStore.user_id, item.drive_id)
      const userToken = UserDAL.GetUserToken(pantreeStore.user_id)
      const dirPath = TreeStore.GetDirPath(item.drive_id, item.file_id).map(node => ({
        drive_id: node.drive_id,
        file_id: node.file_id,
        parent_file_id: node.parent_file_id,
        name: node.name,
        path: node.path,
        description: node.description
      }))
      list.push({
        id: quickFileId(pantreeStore.user_id, item.drive_id, item.file_id),
        user_id: pantreeStore.user_id,
        user_name: userToken.nick_name || userToken.user_name || userToken.name || pantreeStore.user_id,
        provider: driveType.name || '',
        drive_id: item.drive_id,
        drive_name: driveType.title,
        file_id: item.file_id,
        parent_file_id: item.parent_file_id,
        path: item.path || '',
        title: item.name,
        description: item.description || '',
        dir_path: dirPath
      })
    }
  }
  if (list.length == 0) {
    message.error(t('pan.noFolderSelected'))
    return
  }
  PanDAL.updateQuickFile(list)
}
const handleQuickDelete = (id: string) => {
  PanDAL.deleteQuickFile(id)
}
const openQuickFile = async (item: QuickFileEntry) => {
  if (item.user_id !== pantreeStore.user_id) {
    const changed = await UserDAL.UserChange(item.user_id)
    if (!changed) return
  }
  await PanDAL.aOpenQuickFile(item)
}
const handleQuickSelect = async (index: number) => {
  const array = PanDAL.getQuickFileList()
  if (array.length >= index) {
    await openQuickFile(array[index - 1])
  }
}
const handleQuickTreeSelect = async (_keys: any[], e: any) => {
  const item = PanDAL.getQuickFileList().find(shortcut => shortcut.id === e.node.key)
  if (item) await openQuickFile(item)
}
const handleColorTreeSelect = (_keys: any[], e: any) => {
  const drive_id = pantreeStore.backup_drive_id || pantreeStore.resource_drive_id
  pantreeStore.mTreeSelected({ ...e, node: { ...e.node, drive_id } }, true)
}
const quickSelectedKeys = computed(() => {
  const item = PanDAL.getQuickFileList().find(shortcut => shortcut.user_id === pantreeStore.user_id && shortcut.drive_id === pantreeStore.drive_id && shortcut.file_id === pantreeStore.selectDir.file_id)
  return item ? [item.id] : []
})
const filterTreeData = computed(() => {
  return pantreeStore.treeData.filter((item) => {
    if (item.key === 'recent') return false
    if (useSettingStore().securityHideBackupDrive && item.key === 'backup_root') return false
    if (useSettingStore().securityHideResourceDrive && item.key === 'resource_root') return false
    if (useSettingStore().securityHidePicDrive && item.key === 'pic_root') return false
    if (!usePanTreeStore().resource_drive_id && item.key === 'resource_root') return false
    return true
  })
})

const onTreeScroll = () => {
  onHideRightMenuScroll()
}
</script>

<template>
  <div style='width: 100%; height: 100%; overflow: hidden' tabindex='-1'
       @keydown.tab.prevent='() => true'>
    <div class='headswitch'>
      <div class='bghr'></div>
      <div class='sw'>
        <MySwitchTab :name="'panleft'" :tabs='switchValues' :value='appStore.GetAppTabMenu'
                     @update:value="(val:string)=>appStore.toggleTabMenu('pan', val)" />
      </div>
    </div>
    <div class='treeleft' @scroll.capture='onTreeScroll'>
      <a-tabs type='text' :direction="'horizontal'" class='hidetabs' :justify='true'
              :active-key='appStore.GetAppTabMenu'>
        <a-tab-pane key='wangpan' title='1'>
          <a-tree
            ref='treeref'
            class='dirtree'
            block-node
            selectable
            :animation='false'
            :auto-expand-parent='false'
            :virtual-list-props="{ height: treeHeight }"
            :style="{ height: treeHeight + 'px' }"
            :expanded-keys='pantreeStore.treeExpandedKeys'
            :selected-keys='pantreeStore.treeSelectedKeys'
            :data='filterTreeData'
            @select='(_:any[],e:any)=>pantreeStore.mTreeSelected(e, false)'
            @expand='(_:any[],e:any)=>pantreeStore.mTreeExpand(e.node.key, e.expanded)'>
            <template #switcher-icon>
              <IconFont name="iconArrow-Down2" :size="15" />
            </template>
            <template #icon>
              <IconFont name="iconfile-folder" />
            </template>
            <template #title='node'>
              <span v-if="String(node.key).length == 40 || String(node.key).includes('root')"
                    class='dirtitle treedragnode'
                    @contextmenu.prevent='handleTreeRightClick($event, node)'
                    @drop='onRowItemDrop($event, node)'
                    @dragover='onRowItemDragOver'
                    @dragenter='onRowItemDragEnter'
                    @dragleave='onRowItemDragLeave'>
                {{ node.title }}
              </span>
              <span v-else
                    class='dirtitle'>
                {{ node.title }}
              </span>
            </template>
          </a-tree>
        </a-tab-pane>
        <a-tab-pane key='kuaijie' title='2'>
          <a-tree
            class='colortree'
            block-node
            selectable
            :animation='false'
            :auto-expand-parent='false'
            :selected-keys='pantreeStore.treeSelectedKeys'
            :data='colorTreeData'
            @select='handleColorTreeSelect'>
            <template #icon='{ node }'>
              <IconFont name="iconwbiaoqian" :class='node.namesearch' />
            </template>
            <template #title='node'>
              <span :class="'dirtitle ' + node.namesearch">{{ t('pan.mark') }} · {{ node.title }}</span>
            </template>
          </a-tree>
          <div class='quickdrop'
               @drop='onQuickDrop($event)'
               @dragover='onQuickDragOver'
               @dragenter='onQuickDragEnter'
               @dragleave='onRowItemDragLeave'>
            {{ t('pan.quickDropHint1') }}<br />
            {{ t('pan.quickDropHint2') }}
          </div>
          <a-tree
            class='quicktree'
            block-node
            selectable
            :animation='false'
            :auto-expand-parent='false'
            :virtual-list-props="{ height: quickHeight }"
            :style="{ height: quickHeight + 'px' }"
            :selected-keys='quickSelectedKeys'
            :data='pantreeStore.quickData'
            @select='handleQuickTreeSelect'>
            <template #icon>
              <IconFont name="iconfile-folder" />
            </template>
            <template #title='node'>
              <div class="quickitem">
                 <span class='quicktitle' :title='node.title + " · " + (node.user_name || node.user_id) + " · " + node.drive_name'>
                {{ node.title }}
                <small class="quicksource">{{ node.user_name || node.user_id }} · {{ node.drive_name }}</small>
              </span>
                <span class='quickbtn'>
                <a-button type='text' size='mini' @click.stop='handleQuickDelete(node.key)'>
                  {{ t('common.delete') }}
                </a-button>
              </span>
              </div>
            </template>
          </a-tree>
        </a-tab-pane>
      </a-tabs>
    </div>
    <DirLeftMenu :inputselectType='inputselectType' />
  </div>
</template>

<style lang="less">
/* The folder tree is nudged left so its expander column hugs the sidebar edge;
   the tag / quick-file panes stay centred on the pane instead. */
.dirtree {
  height: 100%;
  margin-left: -6px;
}

.dirtree .iconfont,
.sharetree .iconfont,
.quicktree .iconfont,
.videotree .iconfont {
  font-size: 20px;
}

.dirtree .iconfont.iconfile-folder,
.sharetree .iconfont.iconfile-folder,
.quicktree .iconfont.iconfile-folder,
.videotree .iconfont.iconfile-folder {
  color: #ffb74d;
  font-size: 20px;
}

.colortree .iconfont {
  font-size: 20px;
}

.dirtree .iconfont.iconrecover {
  color: #13c2c2;
}

.dirtree .iconfont.icondelete {
  color: #ff4d4fd9;
}

.dirtree .iconfont.iconsearch {
  color: #1890ff;
}

.dirtree .iconfont.iconcrown {
  color: #ffb74d;
}

.dirtree .iconfont.iconrss_video {
  color: #a760ef;
}

.dirtree .iconfont.iconjietu {
  color: #a77566;
}

.colortree .iconfont.iconrss_video {
  color: #a760ef;
}

.arco-tree .iconfile-folder {
  color: #ffb74d;
  font-size: 20px;
}

.dirtitle {
  white-space: nowrap;
  word-break: keep-all;
}

.dirtitle.treedragnode {
  width: 100%;
  display: inline-block;
}

.dirtree .arco-tree-node {
  flex-wrap: nowrap !important;
  flex-shrink: 0 !important;
}

.dirtree .arco-virtual-list {
  overflow-x: hidden;
}

.dirtree .arco-tree-node-title-text {
  flex-grow: 1;
}

/* These trees are drop targets for file rows but are not Arco-draggable themselves, so Arco never
   clears its own drag-over highlight — keep it invisible and let the row handlers do the feedback. */
.dirtree .arco-tree-node-title-highlight,
.colortree .arco-tree-node-title-highlight,
.quicktree .arco-tree-node-title-highlight {
  background-color: transparent;
}

.dirtree .arco-tree-node-title-gap-top::before,
.dirtree .arco-tree-node-title-gap-bottom::before,
.colortree .arco-tree-node-title-gap-top::before,
.colortree .arco-tree-node-title-gap-bottom::before,
.quicktree .arco-tree-node-title-gap-top::before,
.quicktree .arco-tree-node-title-gap-bottom::before {
  background-color: transparent;
}

.arco-tree-node-selected .arco-tree-node-title,
.arco-tree-node-selected .arco-tree-node-title > span {
  color: rgb(var(--primary-6)) !important;
  font-weight: 500;
}

body[arco-theme='dark'] .arco-tree-node-selected .arco-tree-node-title,
body[arco-theme='dark'] .arco-tree-node-selected .arco-tree-node-title > span {
  color: rgb(255, 255, 255) !important;
}

.headswitch {
  width: 100%;
  height: 56px;
  overflow: hidden;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  position: relative;
  padding-top: 16px;
  padding-bottom: 6px;
  flex-shrink: 0;
  flex-grow: 0;
}

.headswitch .bghr {
  position: absolute;
  left: 0;
  right: 0;
  top: 32px;
  border-bottom: 1px solid var(--md-outline-variant);
  z-index: -1;
}

.headswitch .sw {
  background: var(--md-surface-container-low);
  border-radius: var(--md-shape-full);
  width: fit-content;
}

.rootsearch {
  width: calc(100% - 151px) !important;
  float: right;
}

.rootsearch.arco-input-wrapper {
  background-color: transparent;
  border: 1px solid rgb(var(--primary-6)) !important;
}

.colortree {
  height: 180px;
  flex-shrink: 0;
  flex-grow: 0;
}

/* Tag and quick-file rows are leaves: hiding the expander placeholder lets
   the row use the whole sidebar width, so tags centre in it and the quick-file
   delete button reaches the right edge. */
.colortree .arco-tree-node-is-leaf .arco-tree-node-switcher,
.quicktree .arco-tree-node-is-leaf .arco-tree-node-switcher {
  display: none;
}

.colortree .arco-tree-node-title {
  display: flex;
  align-items: center;
  justify-content: center;
}

.colortree .arco-tree-node-title .arco-tree-node-title-text {
  flex: 0 1 auto;
}

.quickdrop {
  height: 50px;
  flex-shrink: 0;
  flex-grow: 0;
  border: 1.5px dashed var(--md-outline-variant);
  border-radius: var(--md-shape-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-3);
  text-align: center;
  line-height: 1.3;
}

.quicktree .arco-tree-node-custom-icon .iconfont {
  font-size: 18px;
  margin-right: 2px;
}

.quicktree .arco-tree-node-title {
  flex: auto;
  display: flex !important;
  flex-direction: row;
}

.quicktree .arco-tree-node-title-text {
  flex: auto;
  display: flex !important;
  flex-direction: row;
}

.quickitem {
  display: flex;
}

.quickitem .quicktitle {
  flex-shrink: 1;
  flex-grow: 1;
  display: -webkit-box;
  max-height: 24px;
  word-break: break-all;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-line-clamp: 1;
}

.quicksource {
  margin-left: 6px;
  color: var(--color-text-3);
  font-size: 11px;
}

.quickitem .quickbtn {
  flex-shrink: 0;
  flex-grow: 0;
  padding-left: 2px;
  padding-right: 2px;
  font-size: 12px;
  color: var(--color-text-3);
}

.quicktree .quickbtn .arco-btn-size-mini {
  padding: 0 4px;
}

.quicktree .quickbtn .arco-btn-size-mini:hover,
.quicktree .quickbtn .arco-btn-size-mini:active {
  color: #fff !important;
  background: rgba(255, 77, 79, 0.85) !important;
}
</style>
