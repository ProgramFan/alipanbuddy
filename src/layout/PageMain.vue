<script setup lang='ts'>
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  KeyboardState,
  useAppStore,
  useFootStore,
  useKeyboardStore,
  useMouseStore,
  useServerStore,
  useSettingStore,
  useUserStore,
  useWinStore
} from '../store'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-vue-next'
import { onHideRightMenu, TestAlt, TestCtrl, TestKey, TestShift } from '../utils/keyboardhelper'
import { copyToClipboard, getFromClipboard, openExternal } from '../utils/electronhelper'
import { Modal } from '@arco-design/web-vue'
import DebugLog from '../utils/debuglog'
import message from '../utils/message'
import { t } from '../i18n'

import Pan from '../pan/index.vue'

import UserInfo from '../user/UserInfo.vue'
import UserLogin from '../user/UserLogin.vue'
import ShutDown from '../setting/ShutDown.vue'

import MyModal from './MyModal.vue'
import { B64decode } from '../utils/format'
import { throttle } from '../utils/debounce'
import { modalDaoRuShareLink } from '../utils/modal'
import { detectShareLink } from '../utils/shareLinkDetection'

const Setting = defineAsyncComponent(() => import('../setting/index.vue'))
const Rss = defineAsyncComponent(() => import('../rss/index.vue'))
const Share = defineAsyncComponent(() => import('../share/index.vue'))
const Down = defineAsyncComponent(() => import('../down/index.vue'))

const panVisible = ref(true)
const sidebarVisibility = ref<Record<'down' | 'share' | 'rss' | 'setting', boolean>>({
  down: true,
  share: true,
  rss: true,
  setting: true
})
const appStore = useAppStore()
const settingStore = useSettingStore()
const winStore = useWinStore()
const keyboardStore = useKeyboardStore()
const mouseStore = useMouseStore()
const footStore = useFootStore()
let shareClipboardTimer: number | undefined
let lastShareClipboardSignature = ''
let shareClipboardPromptOpen = false

function checkClipboardShareLink() {
  if (document.visibilityState !== 'visible' || shareClipboardPromptOpen) return
  let clipboardText = ''
  try {
    clipboardText = getFromClipboard()
  } catch {
    return
  }
  const share = detectShareLink(clipboardText)
  if (!share) return
  const signature = `${share.provider}:${share.url}:${share.password}`
  if (signature === lastShareClipboardSignature) return
  lastShareClipboardSignature = signature
  shareClipboardPromptOpen = true
  const isEnglish = settingStore.uiLanguage === 'en-US'
  Modal.confirm({
    title: isEnglish ? `${share.providerName} share link detected` : `检测到${share.providerName}分享链接`,
    content: share.canImport
      ? (isEnglish ? 'View this share in AlipanBuddy and choose files to save?' : '是否在 神行云盘助手 中查看并选择要保存的文件？')
      : (isEnglish ? `AlipanBuddy cannot directly save ${share.providerName} share links yet. Open it in your browser?` : `神行云盘助手 暂不支持直接转存${share.providerName}分享链接，是否使用浏览器打开？`),
    okText: share.canImport ? (isEnglish ? 'View and save' : '查看并保存') : (isEnglish ? 'Open link' : '打开链接'),
    cancelText: isEnglish ? 'Ignore' : '忽略',
    onOk: () => {
      shareClipboardPromptOpen = false
      if (share.canImport) modalDaoRuShareLink(share.url, share.password)
      else openExternal(share.url)
    },
    onCancel: () => {
      shareClipboardPromptOpen = false
    }
  })
}

function scheduleClipboardShareCheck() {
  window.clearTimeout(shareClipboardTimer)
  shareClipboardTimer = window.setTimeout(checkClipboardShareLink, 250)
}

function handleDocumentVisibilityChange() {
  if (document.visibilityState === 'visible') scheduleClipboardShareCheck()
}

const sidebarTabs = new Set(['pan', 'down', 'share', 'rss', 'setting'])
const hasActiveSidebar = computed(() => sidebarTabs.has(appStore.appTab))
const activeSidebarVisible = computed(() => {
  if (appStore.appTab === 'pan') return panVisible.value
  return sidebarVisibility.value[appStore.appTab as keyof typeof sidebarVisibility.value] ?? true
})
const handleToggleSidebar = () => {
  if (appStore.appTab === 'pan') panVisible.value = !panVisible.value
  else if (appStore.appTab in sidebarVisibility.value) {
    const tab = appStore.appTab as keyof typeof sidebarVisibility.value
    sidebarVisibility.value = { ...sidebarVisibility.value, [tab]: !sidebarVisibility.value[tab] }
  }
}

const handleThemeClick = (val: any) => {
  if (appStore.appTheme == 'system') {
    if (appStore.appDark) {
      useSettingStore().updateStore({ uiTheme: 'light' })
    } else {
      useSettingStore().updateStore({ uiTheme: 'dark' })
    }
  } else if (appStore.appTheme === 'dark') {
    useSettingStore().updateStore({ uiTheme: 'light' })
  } else if (appStore.appTheme === 'light') {
    useSettingStore().updateStore({ uiTheme: 'dark' })
  }
}
const themeTitle = computed(() => {
  if (appStore.appTheme == 'system') {
    return t('theme.auto')
  } else if (appStore.appTheme === 'light') {
    return t('theme.light')
  } else if (appStore.appTheme === 'dark') {
    return t('theme.dark')
  }
})

const primaryTabDefinitions = [
  { key: 'pan', title: 'Alt+1', labelKey: 'nav.pan' }
]

const orderedPrimaryTabs = computed(() => {
  const preferred = settingStore.uiDefaultTab || 'pan'
  return [...primaryTabDefinitions].sort((a, b) => {
    if (a.key === preferred) return -1
    if (b.key === preferred) return 1
    return primaryTabDefinitions.findIndex((item) => item.key === a.key)
      - primaryTabDefinitions.findIndex((item) => item.key === b.key)
  })
})

const trailingTabs = [
  { key: 'down', title: 'Alt+2', labelKey: 'nav.transfer' },
  { key: 'share', title: 'Alt+3', labelKey: 'nav.share' },
  { key: 'rss', title: 'Alt+4', labelKey: 'nav.plugins' }
]

const topNavTabs = computed(() => {
  const hidden = new Set(settingStore.uiHiddenTopTabs || [])
  return [...orderedPrimaryTabs.value, ...trailingTabs].filter((tab) => !hidden.has(tab.key))
})

const handleHideClick = (_e: any) => {
  if (window.WebToElectron) window.WebToElectron({ cmd: useSettingStore().uiExitOnClose ? 'exit' : 'close' })
}
const handleMinClick = (_e: any) => {
  if (window.WebToElectron) window.WebToElectron({ cmd: 'minsize' })
}
const handleMaxClick = (_e: any) => {
  if (window.WebToElectron) window.WebToElectron({ cmd: 'maxsize' })
}


keyboardStore.$subscribe((_m: any, state: KeyboardState) => {
  if (TestAlt('1', state.KeyDownEvent, () => appStore.toggleTab('pan'))) return
  if (TestAlt('2', state.KeyDownEvent, () => appStore.toggleTab('down'))) return
  if (TestAlt('3', state.KeyDownEvent, () => appStore.toggleTab('share'))) return
  if (TestAlt('4', state.KeyDownEvent, () => appStore.toggleTab('rss'))) return
  if (TestAlt('7', state.KeyDownEvent, () => appStore.toggleTab('setting'))) return
  if (TestAlt('f4', state.KeyDownEvent, () => handleHideClick(undefined))) return
  if (TestAlt('m', state.KeyDownEvent, () => handleMinClick(undefined))) return
  if (TestAlt('enter', state.KeyDownEvent, () => handleMaxClick(undefined))) return
  if (TestShift('tab', state.KeyDownEvent, () => appStore.toggleTabNext())) return
  if (TestCtrl('tab', state.KeyDownEvent, () => appStore.toggleTabNextMenu())) return
  if (TestAlt('l', state.KeyDownEvent, () => (useUserStore().userShowLogin = true))) return
  const f11 = () => {
    if (window.WebToElectron) window.WebToElectron({ cmd: 'maxsize' })
  }
  if (TestKey('f11', state.KeyDownEvent, f11)) return
})


const onResize = throttle(() => {
  try {
    const width = document.body.offsetWidth || 960
    const height = document.body.offsetHeight || 720
    if (winStore.width != width || winStore.height != height) {
      winStore.updateStore({ width, height })
    }
  } catch (err) {
  }
  // let ddsound = document.getElementById('ddsound') as { play: any } | undefined
  // if (ddsound) ddsound.play()
}, 50)

const onKeyDown = (event: KeyboardEvent) => {
  const ele = (event.srcElement || event.target) as any
  const nodeName = ele && ele.nodeName
  if (event.key === 'Tab') {
    event.preventDefault()
    event.stopPropagation()
    event.cancelBubble = true
    event.returnValue = false
    if (nodeName && !'BODY|DIV'.includes(nodeName)) ele.blur()
  }
  if (document.body.getElementsByClassName('arco-modal-container').length) return
  if (event.key == 'Control' || event.key == 'Shift' || event.key == 'Alt' || event.key == 'Meta') return
  const isInput = nodeName == 'INPUT' || nodeName == 'TEXTAREA' || false
  if (!isInput) {
    onHideRightMenu()
    keyboardStore.KeyDown(event)
  }
}

const onMouseDown = (event: MouseEvent) => {
  const ele = (event.srcElement || event.target) as any
  const nodeName = ele && ele.nodeName
  if (document.body.getElementsByClassName('arco-modal-container').length) return
  const isInput = nodeName == 'INPUT' || nodeName == 'TEXTAREA' || false
  if (!isInput) {
    mouseStore.KeyDown(event)
  }
}
const handleAsyncDeleteAll = () => {
  footStore.mDeleteAllTask()
}
const handleAsyncClear = () => {
  footStore.mClearTask()
}
const handleAsyncDelete = (key: string) => {
  footStore.mDeleteTask(key)
}
// Apply saved default tab — watch ensures it fires after store + template are ready
watch(() => settingStore.uiDefaultTab, (tab) => {
  if (tab && appStore.appTab !== tab) {
    appStore.toggleTab(tab)
  }
}, { immediate: true })

onMounted(() => {
  onResize()
  DebugLog.aLoadFromDB()
  window.addEventListener('resize', onResize, { passive: true })
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('mousedown', onMouseDown, true)
  window.addEventListener('focus', scheduleClipboardShareCheck)
  document.addEventListener('visibilitychange', handleDocumentVisibilityChange)
  setTimeout(() => {
    onHideRightMenu()
  }, 300)
  window.addEventListener('click', onHideRightMenu, { passive: true })
  shareClipboardTimer = window.setTimeout(checkClipboardShareLink, 800)
})

onUnmounted(() => {
  window.clearTimeout(shareClipboardTimer)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('mousedown', onMouseDown)
  window.removeEventListener('focus', scheduleClipboardShareCheck)
  document.removeEventListener('visibilitychange', handleDocumentVisibilityChange)
  window.removeEventListener('click', onHideRightMenu)
})
</script>
<template>
  <a-layout style='height: 100vh' draggable='false'>
    <a-layout-header id='xbyhead' draggable='false'>
      <div id='xbyhead2' class='q-electron-drag'>
        <a-button v-show="hasActiveSidebar" type='text' size='small' :title="activeSidebarVisible ? '收起侧边栏' : '展开侧边栏'" @click='handleToggleSidebar'>
          <PanelLeftClose v-if='activeSidebarVisible' :size='18' :stroke-width='1.8' />
          <PanelLeftOpen v-else :size='18' :stroke-width='1.8' />
        </a-button>
        <a-menu mode='horizontal' :selected-keys='[appStore.appTab]'
                @update:selected-keys='appStore.toggleTab($event[0])'>
          <a-menu-item
            v-for='item in topNavTabs'
            :key='item.key'
            :title='item.title'
          >
            {{ t(item.labelKey as Parameters<typeof t>[0]) }}
          </a-menu-item>
        </a-menu>

        <ShutDown />
        <UserInfo />
        <UserLogin />
        <a-button type='text' tabindex='-1' style="margin-right: 5px" :title='themeTitle' @click="handleThemeClick">
          <IconFont name="iconnight" v-if="appStore.appTheme === 'dark' || (appStore.appTheme == 'system' && appStore.appDark)" />
          <IconFont name="iconday" v-else />
        </a-button>
        <a-button type='text' tabindex='-1' :title="`${t('common.settings')} Alt+7`" :class="appStore.appTab == 'setting' ? 'active' : ''"
                  @click="appStore.toggleTab('setting')">
          <IconFont name="iconsetting" />
        </a-button>
        <a-button type='text' tabindex='-1' :title="`${t('common.minimize')} Alt+M`" @click='handleMinClick'>
          <IconFont name="iconzuixiaohua" />
        </a-button>
        <a-button type='text' tabindex='-1' :title="`${t('common.maximize')} Alt+Enter`" @click='handleMaxClick'>
          <IconFont name="iconfullscreen" />
        </a-button>
        <a-button type='text' tabindex='-1' :title="`${t('common.close')} Alt+F4`" @click='handleHideClick'>
          <IconFont name="iconclose" />
        </a-button>
      </div>
    </a-layout-header>
    <a-layout-content id='xbybody'>
      <a-tabs type='text' :direction="'horizontal'" class='hidetabs' :justify='true' :active-key='appStore.appTab' lazy-load>
        <a-tab-pane key='pan' title='1'>
          <Pan :visible='panVisible' />
        </a-tab-pane>
        <a-tab-pane key='down' title='2'>
          <Down :sidebar-visible="sidebarVisibility.down" />
        </a-tab-pane>
        <a-tab-pane key='share' title='3'>
          <Share :sidebar-visible="sidebarVisibility.share" />
        </a-tab-pane>
        <a-tab-pane key='rss' title='4'>
          <Rss :sidebar-visible="sidebarVisibility.rss" />
        </a-tab-pane>
        <a-tab-pane key='setting' title='7'>
          <Setting :sidebar-visible="sidebarVisibility.setting" />
        </a-tab-pane>
      </a-tabs>
    </a-layout-content>
    <a-layout-footer id='xbyfoot' draggable='false'>
      <div id='footer2'>
        <div v-if='footStore.loadingInfo' id='footLoading' class='footerBar fix' style='padding: 0 8px 0 0'>
          <div class='arco-spin'>
            <div class='arco-spin-icon'>
              <svg viewBox='0 0 48 48' fill='none' xmlns='http://www.w3.org/2000/svg' stroke='currentColor'
                   class='arco-icon arco-icon-loading arco-icon-spin' stroke-width='4' stroke-linecap='butt'
                   stroke-linejoin='miter'>
                <path d='M42 24c0 9.941-8.059 18-18 18S6 33.941 6 24 14.059 6 24 6'></path>
              </svg>
            </div>
          </div>
          <span style='margin-right: 8px'>{{ footStore.loadingInfo }}</span>
        </div>
        <div class='footinfo'>
          {{ footStore.GetSpaceInfo }}
        </div>
        <div class='flexauto' />
        <div :style="{ display: 'flex', paddingRight: '16px', flexShrink: 0, flexGrow: 0 }">
          <div class='flexauto'></div>
          <div class='footinfo'>
            {{ footStore.GetInfo }}
          </div>
          <div class='footerBar fix' v-show='footStore.uploadTotalSpeed'>
            <IconFont name="iconshangchuansudu" />
            <span id='footUploadSpeed' class='footspeedstr'>
              {{ footStore.uploadTotalSpeed }}
            </span>
          </div>

          <div class='footerBar fix' v-show='footStore.downloadTotalSpeed'>
            <IconFont name="iconxiazaisudu" />
            <span id='footDownSpeed' class='footspeedstr'>
              {{ footStore.downloadTotalSpeed }}
            </span>
          </div>

          <div class='footerBar fix'>
            <span class='footAria' :title="t('footer.ariaConnected')" v-if='footStore.ariaInfo'> {{ footStore.ariaInfo }} </span>
            <span class='footAria' :title="t('footer.ariaOffline')" v-else> Aria ⚯ Offline </span>
          </div>

          <a-popover v-model:popup-visible='footStore.taskVisible' trigger='click' position='top' class='asynclist'>
            <div class='footerBar fix' :title="t('footer.asyncNotifications')" style='cursor: pointer'>
              <span :class="footStore.GetIsRunning ? 'shake' : ''">
                <IconFont name="icontongzhiblue" />
              </span>
              <span>{{ t('footer.asyncNotifications') }}</span>
            </div>
            <template #content>
              <div style='width: 360px; min-height: 120px; max-height: 50vh; overflow-y: auto; overflow-x: hidden'>
                <div style="display:flex;" v-if="footStore.taskList.length > 0">
                  <div style="flex: 1;" :title="t('footer.taskList')">{{ t('footer.taskList') }}</div>
                  <div style="flex: 1;text-align: right">
                    <a-button-group>
                      <a-button type="outline" size='mini' :title="t('footer.clearCompleted')" @click.stop="handleAsyncClear">
                        {{ t('footer.clearCompleted') }}
                      </a-button>
                      <a-popconfirm :content="t('footer.clearAllTasksConfirm')" @ok="handleAsyncDeleteAll">
                        <a-button type="outline" size='mini' tabindex="-1" status="danger" :title="t('footer.clearAll')" style="margin-left: 2px">
                          {{ t('footer.clearAll') }}
                        </a-button>
                      </a-popconfirm>
                    </a-button-group>
                  </div>
                </div>
                <div v-for='item in footStore.taskList' :key='item.key' class='asynclistitem'>
                  <div class='asynclistitem-content'>
                    <div v-if="item.status == 'error'" class='asynclistitem-name danger' :title='item.title'>
                      {{ item.title }}
                    </div>
                    <div v-else class='asynclistitem-name' :title='item.title'>{{ item.title }}</div>
                    <span v-if="item.status == 'running'" class='asynclistitem-progress asynclistitem-icon-running'
                          :title="t('footer.running')"><IconFont name="iconhourglass" />{{ item.usetime }}</span>
                    <span v-if="item.status == 'success'" class='asynclistitem-progress asynclistitem-icon-success'
                          :title="t('footer.success')"><IconFont name="iconcheck" />{{ item.usetime }}</span>
                    <span v-if="item.status == 'error'" class='asynclistitem-progress asynclistitem-icon-error'
                          :title="t('footer.failed')"><IconFont name="iconclose" />{{ item.usetime }}</span>
                  </div>
                  <div class='asynclistitem-operation'>
                    <a-button type='text' size='mini' :title="t('footer.delete')" @click.stop='handleAsyncDelete(item.key)'>{{ t('footer.delete') }}</a-button>
                  </div>
                </div>
                <a-empty v-if='footStore.taskList.length == 0' style='margin-top: 24px'>{{ t('footer.noAsyncTasks') }}</a-empty>
              </div>
            </template>
          </a-popover>
        </div>
      </div>
      <MyModal />
    </a-layout-footer>
  </a-layout>
</template>

<style>
body {
  --app-type-caption: 12px;
  --app-type-control: 13px;
  --app-type-body: 14px;
  --app-type-nav: 14px;
  --app-type-section: 17px;
  --app-type-title: 22px;
}

#xbyhead {
  z-index: 2;
  height: 42px !important;
  padding: 3px 4px 2px 4px !important;
  color: var(--md-on-surface-variant);
  line-height: 37px !important;
  background: var(--md-surface-container);
  border-bottom: 1px solid var(--md-outline-variant);
}

.arco-avatar-circle .arco-avatar-image {
  line-height: 100% !important;
}

#xbyhead2 {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  height: 37px;
  padding: 0px 2px 0 4px;
  line-height: 37px;
}

#xbyhead2 button {
  min-width: 32px !important;
  height: 32px !important;
  min-height: 32px !important;
  margin-right: 1px;
  margin-left: 1px;
  padding: 0 !important;
  line-height: 32px !important;
  display: flex;
  justify-items: center;
  align-items: center;
  align-content: center;
  justify-content: center;
  flex-shrink: 0;
}

#xbyhead2 .arco-btn-text {
  color: var(--md-on-surface-variant);
  border-radius: var(--md-shape-sm);
}

#xbyhead2 .arco-btn-text:hover,
#xbyhead2 .arco-btn-text.active {
  color: var(--md-on-surface);
  background-color: var(--md-state-hover);
}

#xbyhead2 .arco-btn-text.active {
  color: var(--md-primary-text);
  background-color: var(--md-state-selected);
}

#xbyhead2 .iconfont,
#xbyhead2 .iconfont-svg {
  font-size: 24px;
  width: 24px;
  height: 24px;
}










#xbyhead2 .arco-menu-horizontal {
  width: 0;
  min-width: 0;
  flex: 1 1 auto;
  max-width: none;
  height: 37px;
  line-height: 24px;
  overflow: visible;
  background: transparent !important;
}

#xbyhead2 .arco-menu,
#xbyhead2 .arco-menu-horizontal .arco-menu-inner {
  display: flex;
  flex-wrap: nowrap;
  padding: 0;
  overflow: visible;
  background: transparent !important;
}

/* 菜单项仍可点击，隐藏标签留下的菜单空白则可用于拖动窗口。 */
#xbyhead2 .arco-menu,
#xbyhead2 .arco-menu-horizontal .arco-menu-inner,
#xbyhead2 .arco-menu-overflow-wrap {
  -webkit-app-region: drag;
}

#xbyhead2 .arco-menu-horizontal .arco-menu-item,
#xbyhead2 .arco-menu-horizontal .arco-menu-item * {
  -webkit-app-region: no-drag;
}

#xbyhead2 .arco-menu-horizontal .arco-menu-pop,
#xbyhead2 .arco-menu-horizontal .arco-menu-pop-header {
  background: transparent !important;
}

#xbyhead2 .arco-menu-horizontal .arco-menu-item {
  line-height: 24px;
  padding: 0 10px;
  min-width: 0;
  text-align: center;
  flex: 0 0 auto;
  white-space: nowrap;
  color: var(--md-on-surface-variant);
  border-radius: var(--md-shape-sm);
  background: transparent;
  transition: background .18s, color .18s;
}

#xbyhead2 .arco-menu-horizontal .arco-menu-item:hover {
  color: var(--md-on-surface);
  background: var(--md-state-hover);
}

#xbyhead2 .arco-menu-horizontal .arco-menu-item.arco-menu-selected {
  color: var(--md-primary-text);
  background: var(--md-state-selected);
}

#xbyhead2 .arco-menu-horizontal .arco-menu-pop {
  height: 32px;
  line-height: 32px;
}

#xbyhead2 .arco-menu-horizontal .arco-menu-pop::after {
  display: none;
}

#xbyhead2 .arco-menu-horizontal .arco-menu-pop-header {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 8px;
  line-height: 32px;
}

#xbyhead2 .arco-menu-selected-label {
  bottom: -7px;
  left: 0;
  right: 0;
  height: 2px;
  border-radius: 1px;
  background: rgb(var(--primary-6));
}

#xbybody {
  position: relative;
  padding: 0 3px 0 2px;
  height: calc(100% - 42px - 24px);
  overflow: hidden;
  color: var(--md-on-surface);
  background: var(--md-surface-dim);
}

.hidetabs {
  position: relative;
  z-index: 1;
  height: 100%;
  background: transparent !important;
}

.hidetabs > .ant-tabs-nav {
  height: 0 !important;
  display: none !important;
}

.hidetabs .ant-tabs-content {
  height: 100%;
  background: transparent !important;
}

.hidetabs > .arco-tabs-content {
  padding-top: 0 !important;
  padding-bottom: 1px !important;
  height: 100%;
  background: transparent !important;
}

.hidetabs .arco-tabs-content-list,
.hidetabs .arco-tabs-pane {
  height: 100%;
  background: transparent !important;
}

.hidetabs > .arco-tabs-nav {
  width: 0 !important;
  height: 0 !important;
  display: none !important;
}

#xbybody .gs-page,
#xbybody .settings-shell,
#xbybody .settings-sider,
#xbybody .settings-content,
#xbybody .arco-layout,
#xbybody .arco-layout-content {
  background: transparent !important;
  background-color: transparent !important;
}

#xbybody .xbyleft,
#xbybody .settings-sider,
#xbybody .rss-sider {
  position: relative;
  min-width: 176px !important;
  max-width: 420px !important;
  height: 100% !important;
  margin: 0 !important;
  padding: 12px 10px !important;
  color: var(--md-on-surface);
  background: var(--md-surface-container-low) !important;
  border: 0 !important;
  border-right: 1px solid var(--md-outline-variant) !important;
  border-radius: 0 !important;
  overflow: hidden;
  box-shadow: none;
}

/* Sider resize handle (resize-directions=['right']): invisible strip on the
   divider, highlighted while hovering / dragging — no drag-dot icon. */
#xbybody .arco-layout-sider .arco-resizebox-trigger-icon-wrapper {
  display: none !important;
}

#xbybody .arco-layout-sider .arco-resizebox-trigger-vertical {
  width: 8px;
  margin-right: -4px;
  background: transparent;
  cursor: col-resize;
  z-index: 3;
}

#xbybody .arco-layout-sider .arco-resizebox-trigger-vertical:hover,
#xbybody .arco-layout-sider .arco-resizebox-trigger-vertical:active {
  background: linear-gradient(90deg, transparent 3px, rgba(var(--primary-6), .55) 3px 5px, transparent 5px);
}

#xbybody .xbyright,
#xbybody .settings-content,
#xbybody .rightbg {
  min-width: 0;
}

#xbybody .xbyright {
  padding: 12px 16px !important;
  color: var(--md-on-surface);
  background: transparent !important;
}

#xbybody .MySplit {
  background: transparent !important;
}

#xbybody .MySplit .arco-split-pane {
  background: transparent !important;
}

#xbybody .MySplit .arco-split-pane-second {
  padding: 12px 16px 12px 8px;
}

#xbybody .MySplit .arco-split-pane-first {
  background: var(--md-surface-container-low) !important;
  border-right: 1px solid var(--md-outline-variant);
}

/* Straddle the pane divider: the 14px strip is pulled 7px left so its center
   (and hover highlight at left 6px) sits exactly on the pane-first border. */
#xbybody .splitline {
  width: 14px;
  margin: 0 7px 0 -7px;
  border: 0;
  background: transparent;
  z-index: 5;
}

#xbybody .splitline:hover,
#xbybody .splitline.resize {
  background: transparent;
}

/* The pane itself draws the divider hairline; the drag strip stays invisible
   until hovered so it doesn't double the line. */
#xbybody .splitline::before {
  left: 6px;
  width: 1px;
  background: transparent;
}

#xbybody .splitline:hover::before,
#xbybody .splitline.resize::before {
  width: 2px;
  background: rgb(var(--primary-6));
}

#xbybody .splitline .line {
  display: none;
}

#xbybody .headdesc {
  display: flex !important;
  align-items: center;
  height: auto !important;
  min-height: 36px;
  margin: 0 0 12px !important;
  padding: 0 10px 8px !important;
  border: 0 !important;
  border-radius: 0 !important;
  color: var(--md-on-surface);
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0;
  line-height: 1.2;
  background: transparent !important;
  background-image: none !important;
  box-shadow: none !important;
  overflow: hidden;
}

#xbybody .xbyleftmenu,
#xbybody .xbyleftmenu .arco-menu,
#xbybody .xbyleftmenu .arco-menu-inner,
#xbybody .rss-leftmenu,
#xbybody .rss-leftmenu .arco-menu,
#xbybody .rss-leftmenu .arco-menu-inner {
  background: transparent !important;
  color: var(--md-on-surface-variant);
}

#xbybody .xbyleftmenu .arco-menu-item,
#xbybody .rss-leftmenu .arco-menu-item {
  min-height: 40px;
  border: 0 !important;
  border-radius: var(--md-shape-full);
  color: var(--md-on-surface-variant);
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  transition: background .18s, color .18s;
}

#xbybody .xbyleftmenu .arco-menu-item,
#xbybody .rss-leftmenu .arco-menu-item {
  height: 40px;
  margin: 0 0 4px;
  padding: 0 16px !important;
  line-height: 40px;
  box-shadow: none !important;
}

#xbybody .xbyleftmenu .arco-menu-item:hover,
#xbybody .rss-leftmenu .arco-menu-item:hover {
  color: var(--md-on-surface) !important;
  background: var(--md-state-hover) !important;
}

#xbybody .xbyleftmenu .arco-menu-selected,
#xbybody .rss-leftmenu .arco-menu-selected {
  color: var(--md-primary-text) !important;
  background: var(--md-state-selected) !important;
  font-weight: 600;
}

#xbybody .xbyleftmenu .arco-menu-item::after,
#xbybody .rss-leftmenu .arco-menu-item::after {
  display: none !important;
}

#xbybody .single-boundary-sidebar > .single-boundary-sidebar-menu {
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
}

#xbybody .single-boundary-sidebar > .single-boundary-sidebar-menu .arco-menu-inner {
  padding: 0 !important;
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}

#xbybody .single-boundary-sidebar .single-boundary-sidebar-menu .arco-menu-item {
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}

#xbybody .single-boundary-sidebar .single-boundary-sidebar-menu .arco-menu-item:hover {
  border: 0 !important;
  background: var(--md-state-hover) !important;
  box-shadow: none !important;
}

#xbybody .single-boundary-sidebar .single-boundary-sidebar-menu .arco-menu-selected {
  border-color: transparent !important;
  background: var(--md-state-selected) !important;
  box-shadow: none !important;
}

#xbybody .single-boundary-sidebar .single-boundary-sidebar-menu .arco-menu-item::before,
#xbybody .single-boundary-sidebar .single-boundary-sidebar-menu .arco-menu-item::after {
  display: none !important;
}

#xbybody .settings-side-title,
#xbybody .scan-progress-section {
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
}

#xbybody .settings-side-title {
  border-radius: 0 !important;
}

#xbybody .scan-progress-section {
  border-radius: var(--md-shape-md) !important;
  background: var(--md-state-hover) !important;
}

#xbybody .arco-card,
#xbybody .arco-list,
#xbybody .arco-table,
#xbybody .arco-collapse,
#xbybody .arco-tabs-card,
#xbybody .arco-drawer,
#xbybody .settings-card,
#xbybody .settings-panel,
#xbybody .settingcard,
#xbybody .summary-item,
#xbybody .placeholder-card,
#xbybody .server-switch-menu,
#xbybody .home-intro,
#xbybody .home-error,
#xbybody .home-loading,
#xbybody .empty-placeholder,
#xbybody .detail-section,
#xbybody .person-shelf-card,
#xbybody .person-rail-card,
#xbybody .listing-toggle-group,
#xbybody .gs-panel {
  color: var(--md-on-surface);
  border-color: var(--md-outline-variant) !important;
  background: var(--md-surface) !important;
  box-shadow: none;
}

#xbybody .arco-card,
#xbybody .settings-card,
#xbybody .settings-panel,
#xbybody .settingcard,
#xbybody .summary-item,
#xbybody .placeholder-card,
#xbybody .detail-section,
#xbybody .person-shelf-card,
#xbybody .person-rail-card,
#xbybody .gs-panel {
  border-radius: var(--md-shape-md) !important;
}

#xbybody .xbyright > .hidetabs,
#xbybody .rightbg,
#xbybody .settings-content {
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none;
}

#xbybody .xbyright > .hidetabs {
  height: 100%;
  overflow: hidden;
}

#xbybody .rightbg,
#xbybody .settings-content {
  height: 100%;
  overflow: hidden;
}

#xbybody .settings-content {
  box-sizing: border-box;
  height: 100%;
  margin: 0 !important;
}

#xbybody #SettingObserver.settings-content {
  overflow-x: hidden !important;
  overflow-y: auto !important;
}

#xbybody .home-page,
#xbybody .search-shell,
#xbybody .detail-page,
#xbybody .person-content {
  color: var(--md-on-surface) !important;
  background: transparent !important;
  background-color: transparent !important;
}

#xbybody .server-empty-shell h2,
#xbybody .home-intro h2,
#xbybody .detail-section-title,
#xbybody .person-shelf-title,
#xbybody .person-rail-title,
#xbybody .settinghead {
  color: var(--md-on-surface) !important;
}

#xbybody .server-empty-shell p,
#xbybody .person-rail-subtitle,
#xbybody .person-rail-overview,
#xbybody .settingrow,
#xbybody .helptxt {
  color: var(--md-on-surface-variant) !important;
}

#xbybody .scan-header,
#xbybody .listing-overlay-badge {
  color: var(--md-primary-text) !important;
  background: var(--md-state-selected) !important;
  border-color: rgba(var(--primary-6),.30) !important;
}

#xbybody .listing-toggle-group button,
#xbybody .home-poster-toggle button {
  color: var(--md-on-surface-variant) !important;
  background: transparent !important;
}

#xbybody .listing-toggle-group button.active,
#xbybody .home-poster-toggle button.active {
  color: var(--md-primary-text) !important;
  background: var(--md-state-selected) !important;
  box-shadow: none;
}

#xbybody .arco-table-th,
#xbybody .arco-table-td,
#xbybody .arco-list-item,
#xbybody .arco-collapse-item,
#xbybody .arco-card-header,
#xbybody .arco-card-body {
  color: var(--md-on-surface);
  border-color: var(--md-outline-variant) !important;
  background: transparent !important;
}

#xbybody .arco-table-tr:hover .arco-table-td,
#xbybody .arco-list-item:hover,
#xbybody .arco-collapse-item:hover {
  background: var(--md-state-hover) !important;
}

#xbybody .arco-input-wrapper,
#xbybody .arco-select-view,
#xbybody .arco-textarea-wrapper,
#xbybody .arco-input-tag,
#xbybody .arco-input-number,
#xbybody .arco-picker {
  color: var(--md-on-surface);
  border-color: var(--md-outline-variant) !important;
  background: var(--md-surface) !important;
  box-shadow: none;
}

#xbybody .arco-input-wrapper:hover,
#xbybody .arco-select-view:hover,
#xbybody .arco-textarea-wrapper:hover,
#xbybody .arco-input-tag:hover,
#xbybody .arco-input-number:hover,
#xbybody .arco-picker:hover {
  border-color: rgba(var(--primary-6),.45) !important;
  background: var(--md-surface) !important;
}

#xbybody .arco-btn:not(.arco-btn-primary):not(.arco-btn-text) {
  color: var(--md-on-surface);
  border-color: var(--md-outline-variant);
  background: transparent;
  box-shadow: none;
}

#xbybody .arco-btn:not(.arco-btn-primary):not(.arco-btn-text):hover {
  color: var(--md-on-surface);
  border-color: rgba(var(--primary-6),.45);
  background: var(--md-state-hover);
}

#xbybody .arco-btn-primary {
  border-color: transparent;
  color: #fff;
  background: rgb(var(--primary-6));
  box-shadow: none;
}

#xbybody .arco-btn-primary:hover {
  background: rgb(var(--primary-5));
}

#xbybody .arco-tag,
#xbybody .arco-badge-status-text,
#xbybody .arco-radio-button,
#xbybody .arco-checkbox-label {
  color: var(--md-on-surface-variant);
}

#xbybody {
  font-size: var(--app-type-body);
}

#xbybody .treeleft .arco-tree-node-title,
#xbybody .treeleft .arco-tree-node-title-text,
#xbybody .xbyleftmenu .arco-menu-item,
#xbybody .xbyleftmenu .arco-menu-title,
#xbybody .rss-leftmenu .arco-menu-item,
#xbybody .rss-leftmenu .arco-menu-title {
  font-size: var(--app-type-nav) !important;
}

#xbybody .settings-sider .settings-side-kicker,
#xbybody .settings-sider .settings-side-title small {
  font-size: var(--app-type-caption) !important;
}

#xbybody .arco-input,
#xbybody .arco-textarea,
#xbybody .arco-select-view-value,
#xbybody .arco-select-view-placeholder,
#xbybody .arco-input-number-input,
#xbybody .arco-picker input,
#xbybody .arco-btn,
#xbybody .arco-radio-label,
#xbybody .arco-checkbox-label,
#xbybody .arco-tabs-tab-title,
#xbybody .arco-dropdown-option {
  font-size: var(--app-type-control) !important;
}

#xbybody .arco-table-th,
#xbybody .arco-table-td,
#xbybody .arco-list-item,
#xbybody .arco-collapse-item,
#xbybody .arco-card-header,
#xbybody .arco-card-body {
  font-size: var(--app-type-body);
}

#xbybody .arco-tag,
#xbybody .arco-badge-status-text,
#xbybody .arco-form-item-message,
#xbybody .arco-form-item-extra {
  font-size: var(--app-type-caption) !important;
}

body > .arco-modal-container,
body > .arco-drawer-container,
body > .arco-trigger-popup {
  font-size: var(--app-type-body);
}

body > .arco-modal-container :where(.arco-btn, .arco-input, .arco-textarea, .arco-select-view-value, .arco-select-view-placeholder, .arco-radio-label, .arco-checkbox-label, .arco-tabs-tab-title),
body > .arco-drawer-container :where(.arco-btn, .arco-input, .arco-textarea, .arco-select-view-value, .arco-select-view-placeholder, .arco-radio-label, .arco-checkbox-label, .arco-tabs-tab-title),
body > .arco-trigger-popup :where(.arco-dropdown-option, .arco-select-option, .arco-cascader-option) {
  font-size: var(--app-type-control) !important;
}

@media (prefers-reduced-motion: reduce) {
  #xbybody *,
  #xbybody *::before,
  #xbybody *::after {
    transition-duration: .01ms !important;
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
  }
}

body:not([arco-theme='dark']) #xbybody .cellcount .arco-badge-status-text {
  color: var(--color-text-2);
}

#xbyfoot {
  display: flex;
  flex-direction: row;
  height: 24px;
  padding: 0 0 0 16px;
  color: var(--foot-txt);
  font-size: 12px;
  line-height: 23px;
  background: var(--foot-bg);
  border-top: 1px solid var(--md-outline-variant);
}

a {
  color: var(--md-primary-text);
}

#footer2 {
  display: flex;
  flex: 100% 1 1;
  flex-direction: row;
  height: 24px;
  padding: 0;
  color: inherit;
  font-size: 12px;
  line-height: 24px;
  justify-content: stretch;
  align-items: center;
}

.footerBar {
  flex: auto 1;
  flex-shrink: 0;
  padding: 0 8px;
  cursor: default;
  height: 100%;
  line-height: 24px;
  transition: background-color 0.2s, color 0.2s, box-shadow 0.2s;
  display: flex;
  flex-direction: row;
  justify-content: stretch;
  align-items: center;
}

.footerBar.fix {
  flex-grow: 0;
}

.footerBar:hover {
  color: var(--md-on-surface);
  background-color: var(--md-state-hover);
}

.footerBar .iconfont {
  font-size: 14px;
  line-height: 24px;
}

#footLoading .arco-icon-loading {
  color: currentColor;
  width: 14px;
  height: 14px;
}

.footloadingicon {
  width: 14px;
  height: 14px;
  display: inline-block;
}

.syncmessage {
  width: 380px;
}

#footLoading .arco-spin .arco-spin-icon {
  padding-bottom: 4px;
  margin-right: 2px;
}

.footinfo {
  padding: 0 8px;
  opacity: 0.9;
}

body[arco-theme='dark'] .footinfo {
  opacity: 0.8;
}

.footuploadlist .arco-popover-popup-content,
.footdownlist .arco-popover-popup-content,
.asynclist .arco-popover-popup-content {
  padding: 0 8px 12px 8px;
  margin-right: 8px;
}

.asynclistitem {
  position: relative;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  margin-top: 12px;
}

.asynclistitem-content {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  box-sizing: border-box;
  width: 100%;
  padding: 8px 10px 8px 12px;
  overflow: hidden;
  font-size: 14px;
  background-color: var(--color-fill-1);
  border-radius: var(--border-radius-small);
  transition: background-color 0.1s cubic-bezier(0, 0, 1, 1);
}

.asynclistitem-operation {
  margin-left: 12px;
  color: var(--color-text-2);
  font-size: 12px;
}

.asynclistitem-operation .arco-btn {
  padding: 0 6px;
}

.asynclistitem-name {
  display: flex;
  flex: 1;
  align-items: center;
  margin-right: 10px;
  overflow: hidden;
  color: rgb(var(--link-6));
  font-size: 14px;
  line-height: 1.4286;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.asynclistitem-progress {
  position: relative;
  margin-left: auto;
  line-height: 12px;
  min-width: 52px;
  display: inline-block;
}

.asynclistitem-icon-running {
  color: var(--color-text-2);
  font-size: 14px;
  line-height: 14px;
}

.asynclistitem-icon-success {
  color: rgb(var(--success-6));
  font-size: 14px;
  line-height: 14px;
}

.asynclistitem-icon-error {
  color: rgb(var(--danger-6));
  font-size: 14px;
  line-height: 14px;
}

#footer2 audio {
  border-radius: 0;
  border: none;
  outline: none;
}

#footer2 audio::-webkit-media-controls-panel {
  border-radius: 0;
  border: none;
  color: #ffffff !important;
  filter: invert(80);
}

#footer2 audio::-webkit-media-controls-enclosure {
  background: var(--foot-bg);
  border-radius: 4px;
}

#footer2 audio::-webkit-media-controls-current-time-display,
#footer2 audio::-webkit-media-controls-time-remaining-display {
  text-shadow: unset;
  font-size: 12px;
  font-weight: bold;
  color: #000000 !important;
}

body[arco-theme='dark'] #footer2 audio::-webkit-media-controls-panel {
  filter: invert(0);
}

body[arco-theme='dark'] #footer2 audio::-webkit-media-controls-current-time-display,
body[arco-theme='dark'] #footer2 audio::-webkit-media-controls-time-remaining-display {
  color: #ffffff !important;
}

.arco-upload-list-item-file-icon {
  margin-right: 4px !important;
}

.footspeedstr {
  min-width: 52px;
  max-width: 140px;
  overflow: hidden;
  display: inline-block;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.footerBar.fix > span:last-child {
  min-width: 0;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

<style>
.shake {
  animation-name: upAnimation;
  transform-origin: center top;
  animation-duration: 2s;
  animation-fill-mode: both;
  animation-iteration-count: infinite;
  animation-delay: 0.5s;
}

@keyframes upAnimation {
  0% {
    transform: rotate(0deg);
    transition-timing-function: cubic-bezier(0.215, 0.61, 0.355, 1);
  }
  10% {
    transform: rotate(-12deg);
    transition-timing-function: cubic-bezier(0.215, 0.61, 0.355, 1);
  }
  20% {
    transform: rotate(12deg);
    transition-timing-function: cubic-bezier(0.215, 0.61, 0.355, 1);
  }
  28% {
    transform: rotate(-10deg);
    transition-timing-function: cubic-bezier(0.215, 0.61, 0.355, 1);
  }
  36% {
    transform: rotate(10deg);
    transition-timing-function: cubic-bezier(0.755, 0.5, 0.855, 0.06);
  }
  42% {
    transform: rotate(-8deg);
    transition-timing-function: cubic-bezier(0.755, 0.5, 0.855, 0.06);
  }
  48% {
    transform: rotate(8deg);
    transition-timing-function: cubic-bezier(0.755, 0.5, 0.855, 0.06);
  }
  52% {
    transform: rotate(-4deg);
    transition-timing-function: cubic-bezier(0.755, 0.5, 0.855, 0.06);
  }
  56% {
    transform: rotate(4deg);
    transition-timing-function: cubic-bezier(0.755, 0.5, 0.855, 0.06);
  }
  60% {
    transform: rotate(0deg);
    transition-timing-function: cubic-bezier(0.755, 0.5, 0.855, 0.06);
  }
  100% {
    transform: rotate(0deg);
    transition-timing-function: cubic-bezier(0.215, 0.61, 0.355, 1);
  }
}
</style>
