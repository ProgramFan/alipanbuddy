<script setup lang='ts'>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { IShareSiteModel, useServerStore, useWinStore } from '../../store'
import { B64decode } from '../../utils/format'
import { modalDaoRuShareLink } from '../../utils/modal'
import message from '../../utils/message'
import { openExternal } from '../../utils/electronhelper'
import ServerHttp from '../../aliapi/server'
import DebugLog from '../../utils/debuglog'
import { invoke } from '../../tauri/invoke'
import { listen } from '../../tauri/bridge'

const serverStore = useServerStore()
const winStore = useWinStore()
const itemHeight = computed(() => (winStore.height - 24 - 20 - 42 - 77).toString() + 'px')

const hideLeft = ref(false)
const siteUrl = ref('')

// The site is shown in the separate Tauri window labelled 'site' (Tauri has no embedded webview element);
// it reports navigations through 'site-navigation' and its closing through 'site-closed'.
let siteListeners: Promise<UnlistenFn[]> | null = null

const emits = defineEmits(['hideLeft'])

const openSiteWindow = (url: string) => {
  invoke('open_site_window', { url }).catch((err: any) => {
    DebugLog.mSaveWarning('open_site_window failed ' + (err?.message || err))
    message.error('打开网页失败，请使用浏览器打开')
  })
}

const handleSite = (item: IShareSiteModel) => {
  if (item.url.startsWith('http')) {
    siteUrl.value = item.url
  } else {
    const ourl = B64decode(item.url)
    if (ourl) siteUrl.value = ourl
    else siteUrl.value = ''
  }

  if (item.group == 'doc' || item.external) {
    openExternal(siteUrl.value)
    siteUrl.value = ''
    return
  }
  if (!siteUrl.value) return
  openSiteWindow(siteUrl.value)
}
const handleHideLeft = () => {
  hideLeft.value = !hideLeft.value
  emits('hideLeft', hideLeft.value)
}

const siteWindowCmd = async (cmd: 'back' | 'forward' | 'reload' | 'clear-cookies') => {
  if (!siteUrl.value) {
    message.error('打开网页失败，请手动刷新网页')
    return false
  }
  try {
    await invoke('site_window_cmd', { cmd })
    return true
  } catch (err: any) {
    DebugLog.mSaveWarning('site_window_cmd ' + cmd + ' failed ' + (err?.message || err))
    message.error('打开网页失败，请手动刷新网页')
    return false
  }
}

const handleClearCookies = async () => {
  if (await siteWindowCmd('clear-cookies')) message.success('清除Cookies成功')
}

const handleSiteShareUrl = async (event: any) => {
  // 获取点击的 URL
  const url = event?.url || ''
  if (/(aliyundrive|alipan).com\/s\/[0-9a-zA-Z_]{11,}/.test(url)) {
    modalDaoRuShareLink(url)
  }
}

const handleClose = () => {
  siteUrl.value = ''
  invoke('close_site_window').catch(() => {})
  hideLeft.value = false
  emits('hideLeft', false)
}

const handleSiteClosed = () => {
  if (!siteUrl.value) return
  siteUrl.value = ''
  hideLeft.value = false
  emits('hideLeft', false)
}

const handleRefreshSiteList = () => {
  ServerHttp.CheckConfigUpgrade().catch((err: any) => {
    DebugLog.mSaveDanger('CheckConfigUpgrade', err)
  })
}

const handleRefresh = () => {
  siteWindowCmd('reload')
}

const handleBack = () => {
  siteWindowCmd('back')
}

const handleForward = () => {
  siteWindowCmd('forward')
}

const handleReopen = () => {
  if (siteUrl.value) openSiteWindow(siteUrl.value)
}

onMounted(() => {
  siteListeners = Promise.all([
    listen<{ url: string }>('site-navigation', (event) => handleSiteShareUrl(event.payload)),
    listen('site-closed', () => handleSiteClosed())
  ]).catch((err: any) => {
    DebugLog.mSaveWarning('site window listen failed ' + (err?.message || err))
    return [] as UnlistenFn[]
  })
})

onUnmounted(() => {
  const listeners = siteListeners
  siteListeners = null
  if (listeners) listeners.then((fns) => fns.forEach((fn) => fn())).catch(() => {})
  if (siteUrl.value) invoke('close_site_window').catch(() => {})
})
</script>

<template>
  <div v-show='!siteUrl'>
    <a-tabs class='share-site-tabs'>
      <template #extra>
        <a-button type='text' size='large' tabindex='-1' @click='handleRefreshSiteList'>
          <IconFont name="iconreload-1-icon" />刷新列表
        </a-button>
      </template>
      <template v-if='serverStore.shareSiteGroupList.length > 0'>
        <a-tab-pane :style="{ height: itemHeight }" v-for='(item, index) in serverStore.shareSiteGroupList' :key='index'
                    :title='item.title'>
          <a-card :bordered='false' class='site-list'>
            <template v-for='(siteItem, index) in serverStore.shareSiteList' :key='index'>
              <a-card-grid v-if='siteItem.group === item.group' :hoverable='index % 2 === 0' class='site-list-item'>
                <a :style='{ color: siteItem.color }'
                   @click='handleSite(siteItem)'
                   v-html='`${siteItem.title}<small>${siteItem.tip}</small>`' />
              </a-card-grid>
            </template>
          </a-card>
        </a-tab-pane>
      </template>
      <template v-else>
        <a-tab-pane title='全部'>
          <a-card :bordered='false' class='site-list'>
            <a-card-grid v-for='(siteItem, index) in serverStore.shareSiteList'
                         :key='index'
                         :hoverable='index % 2 === 0'
                         class='sitelistitem'>
              <a :style='{ color: siteItem.color }'
                 @click='handleSite(siteItem)'
                 v-html='`${siteItem.title}<small>${siteItem.tip}</small>`' />
            </a-card-grid>
          </a-card>
        </a-tab-pane>
      </template>
    </a-tabs>
  </div>
  <div class='top-btn' style='height: 32px' v-show='siteUrl'>
    <div class='toppanbtn'>
      <a-popconfirm content='确认要清除当前网站Cookies？' @ok='handleClearCookies'>
        <a-button type='text' size='small' tabindex='-1'>
          <IconFont name="icondelete" />清除Cookies
        </a-button>
      </a-popconfirm>
    </div>
    <div class='toppanbtn'>
      <a-button type='text' size='small' tabindex='-1' @click='openExternal(siteUrl)'>
        <IconFont name="icondebug" />浏览器打开
      </a-button>
    </div>
    <div class='toppanbtn'>
      <a-button type='text' size='small' tabindex='-1' @click='handleHideLeft'>
        <IconFont name="iconfullscreen" />显隐侧边栏
      </a-button>
    </div>
    <div class='toppanbtn'>
      <a-button type='text' size='small' tabindex='-1' @click='handleBack'>
        <IconFont name="iconarrow-left-1-icon" />回退
      </a-button>
    </div>
    <div class='toppanbtn'>
      <a-button type='text' size='small' tabindex='-1' @click='handleForward'>
        <IconFont name="iconarrow-right-1-icon" />前进
      </a-button>
    </div>
    <div class='toppanbtn'>
      <a-button type='text' size='small' tabindex='-1' @click='handleRefresh'>
        <IconFont name="iconreload-1-icon" />刷新
      </a-button>
    </div>
    <div class='toppanbtn'>
      <a-button type='text' status='danger' size='small' tabindex='-1' @click='handleClose'>
        <IconFont name="iconclose" />关闭
      </a-button>
    </div>
  </div>
  <div class='site-content' v-show='siteUrl'>
    <div class='site-content-tip'>
      <div class='site-content-title'>网站已在独立窗口中打开</div>
      <div class='site-content-url'>{{ siteUrl }}</div>
      <div class='site-content-desc'>在独立窗口中点击阿里云盘分享链接会自动弹出导入窗口</div>
      <a-button type='primary' size='small' tabindex='-1' @click='handleReopen'>显示网站窗口</a-button>
    </div>
  </div>
</template>

<style lang='less'>
.site-title {
  height: 100%;
  width: calc(100% - 32px);
  margin: 24px 24px 24px 8px;
  font-size: 18px;
  line-height: 20px;
  font-weight: 500;
  text-align: center;
  color: var(--color-text-1);
}

.share-site-tabs {
  height: 100%;

  .arco-tabs-content-list .arco-tabs-content-item-active .arco-tabs-pane {
    overflow-y: auto;
  }

  .site-list {
    text-align: center;
    width: calc(100% - 32px);
    margin: 0 24px 24px 8px;
    box-sizing: border-box;

    .arco-card-header {
      border-bottom: none !important;
    }

    .site-list-item {
      width: 25%;
      padding: 26px 0;
      text-align: center;
      font-size: 16px;
      color: rgb(188, 143, 143);

      a {
        cursor: pointer;
        color: rgb(var(--color-link-light-2));
      }

      small {
        padding-left: 4px;
        font-size: 12px;
      }

      &:hover {
        background-color: var(--color-fill-2);
        color: rgb(var(--primary-6));
      }
    }
  }

}


.top-btn {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  max-width: 100%;
  min-width: 440px;
  user-select: none;
  margin-top: 12px;
  box-sizing: border-box;
  border-bottom: #1e1e1e 1px solid;
  box-shadow: var(--topshadow) 0px 2px 12px 0px;
}

.site-content {
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(100%);
  height: calc(100% - 44px);
  border: none;
  overflow: hidden;

  .site-content-tip {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    max-width: 80%;
    text-align: center;
    color: var(--color-text-1);
  }

  .site-content-title {
    font-size: 18px;
    font-weight: 500;
  }

  .site-content-url {
    font-size: 13px;
    color: var(--color-text-2);
    word-break: break-all;
    user-select: text;
  }

  .site-content-desc {
    font-size: 12px;
    color: var(--color-text-3);
  }
}
</style>
