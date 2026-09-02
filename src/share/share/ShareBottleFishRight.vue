<script setup lang="ts">
import { useUserStore } from '../../store'
import { KeyboardMessage } from '../../store/keyboardstore'
import ShareDAL from './ShareDAL'
import { TestCtrl } from '../../utils/keyboardhelper'
import { copyToClipboard, openExternal } from '../../tauri/app'
import message from '../../utils/message'

import { modalShowShareLink } from '../../utils/modal'
import { GetShareUrlFormate } from '../../utils/shareurl'
import useShareBottleFishStore from './ShareBottleFishStore'
import ShareListPage from '../ShareListPage.vue'

const shareBottleFishStore = useShareBottleFishStore()

const handleRefresh = () => ShareDAL.aReloadShareBottleFish(useUserStore().user_id, true)
const handleOrder = (order: string) => shareBottleFishStore.mOrderListData(order)

const handleOpenLink = (share: any) => {
  if (share && share.shareId) {
    // donothing
  } else {
    share = shareBottleFishStore.GetSelectedFirst()
  }
  if (!share.shareId) {
    message.error('没有选中分享链接！')
  } else {
    modalShowShareLink(share.shareId, share.share_pwd, '', true, [])
  }
}
const handleCopySelectedLink = () => {
  const list = shareBottleFishStore.GetSelected()
  let link = ''
  for (let i = 0, maxi = list.length; i < maxi; i++) {
    const item = list[i]
    link += GetShareUrlFormate(item.share_name, 'https://www.aliyundrive.com/s/' + item.shareId, '') + '\n'
  }
  if (list.length == 0) {
    message.error('没有选中分享链接！')
  } else {
    copyToClipboard(link)
    message.success('分享链接已复制到剪切板(' + list.length.toString() + ')')
  }
}
const handleBrowserLink = () => {
  const first = shareBottleFishStore.GetSelectedFirst()
  if (!first) return
  if (first.shareId) {
    openExternal('https://www.aliyundrive.com/s/' + first.shareId)
  }
}

const handleShortcuts = (event: KeyboardMessage) => {
  if (TestCtrl('b', event, handleBrowserLink)) return true
  return TestCtrl('c', event, handleCopySelectedLink)
}
</script>

<template>
  <ShareListPage :enter-fun="handleOpenLink" :range-select="false" :shortcuts="handleShortcuts"
                 :store="shareBottleFishStore" empty="没导入过任何分享链接" key-field="shareId"
                 menu="ShareBottleFishRight" menu-id="rightsharebottlefishmenu" title="好运分享" @refresh="handleRefresh">
    <template #buttons>
      <div v-show="shareBottleFishStore.IsListSelected" class="toppanbtn">
        <a-button type="text" size="small" tabindex="-1" title="Ctrl+O" @click="handleOpenLink">
          <IconFont name="iconchakan" />查看
        </a-button>
        <a-button type="text" size="small" tabindex="-1" title="Ctrl+C" @click="handleCopySelectedLink">
          <IconFont name="iconcopy" />复制链接
        </a-button>
        <a-button type="text" size="small" tabindex="-1" title="Ctrl+B" @click="handleBrowserLink">
          <IconFont name="iconchrome" />浏览器
        </a-button>
      </div>
    </template>

    <template #columns>
      <div :class="'cell sharetime'">
        是否保存
      </div>
      <div :class="'cell sharetime order ' + (shareBottleFishStore.ListOrderKey == 'mtime' ? 'active' : '')" @click="handleOrder('mtime')">
        修改时间
        <IconFont name="iconxia" />
      </div>
    </template>

    <template #row="{ item }">
      <div class="fileicon">
        <IconFont name="iconlink2" aria-hidden="true" />
      </div>
      <div class="filename">
        <div :title="'https://www.aliyundrive.com/s/' + item.shareId" @click="handleOpenLink(item)">
          {{ item.share_name }}
        </div>
      </div>
      <div class="cell sharestate active">{{ item.saved_msg }}</div>
      <div class="cell sharetime">{{ item.gmt_created }}</div>
    </template>

    <template #menu>
      <a-doption @click="handleOpenLink">
        <template #icon><IconFont name="iconchakan" /></template>
        <template #default>查看</template>
      </a-doption>

      <a-doption @click="handleCopySelectedLink">
        <template #icon><IconFont name="iconcopy" /></template>
        <template #default>复制链接</template>
      </a-doption>
      <a-doption @click="handleBrowserLink">
        <template #icon><IconFont name="iconchrome" /></template>
        <template #default>浏览器</template>
      </a-doption>
    </template>
  </ShareListPage>
</template>

<style></style>
