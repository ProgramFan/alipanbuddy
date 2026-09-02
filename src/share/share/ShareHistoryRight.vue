<script setup lang="ts">
import { useUserStore } from '../../store'
import { KeyboardMessage } from '../../store/keyboardstore'
import ShareDAL from './ShareDAL'
import { TestCtrl } from '../../utils/keyboardhelper'
import { copyToClipboard, openExternal } from '../../tauri/app'
import message from '../../utils/message'

import { modalShowShareLink } from '../../utils/modal'
import { GetShareUrlFormate } from '../../utils/shareurl'
import useShareHistoryStore from './ShareHistoryStore'
import AliShare from '../../aliapi/share'
import ShareListPage from '../ShareListPage.vue'

const shareHistoryStore = useShareHistoryStore()

const handleRefresh = () => ShareDAL.aReloadShareHistory(useUserStore().user_id, true)
const handleOrder = (order: string) => shareHistoryStore.mOrderListData(order)

const handleOpenLink = (share: any) => {
  if (share && share.share_id) {
    // donothing
  } else {
    share = shareHistoryStore.GetSelectedFirst()
  }
  if (!share.share_id) {
    message.error('没有选中分享链接！')
  } else {
    modalShowShareLink(share.share_id, share.share_pwd, '', true, [], false)
  }
}
const handleSaveMyImport = () => {
  const selected = shareHistoryStore.GetSelected()
  if (selected.length == 0) {
    message.error('没有选中分享')
    return
  }
  for (let item of selected) {
    AliShare.ApiGetShareAnonymous(item.share_id).then((info) => {
      ShareDAL.SaveOtherShare('', info, false)
    })
  }
  ShareDAL.aReloadOtherShare()
  message.success('已保存所选分享到我的导入，请手动刷新我的导入数据')
}
const handleCopySelectedLink = () => {
  const list = shareHistoryStore.GetSelected()
  let link = ''
  for (let i = 0, maxi = list.length; i < maxi; i++) {
    const item = list[i]
    link += GetShareUrlFormate(item.share_name, 'https://www.aliyundrive.com/s/' + item.share_id, '') + '\n'
  }
  if (list.length == 0) {
    message.error('没有选中分享链接！')
  } else {
    copyToClipboard(link)
    message.success('分享链接已复制到剪切板(' + list.length.toString() + ')')
  }
}
const handleBrowserLink = () => {
  const first = shareHistoryStore.GetSelectedFirst()
  if (!first) return
  if (first.share_id) {
    openExternal('https://www.aliyundrive.com/s/' + first.share_id)
  }
}

const handleShortcuts = (event: KeyboardMessage) => {
  if (TestCtrl('b', event, handleBrowserLink)) return true
  return TestCtrl('c', event, handleCopySelectedLink)
}
</script>

<template>
  <ShareListPage :enter-fun="handleOpenLink" :shortcuts="handleShortcuts" :store="shareHistoryStore"
                 empty="没导入过任何分享链接" menu="ShareHistoryRight" menu-id="rightsharehistorymenu" title="历史导入"
                 @refresh="handleRefresh">
    <template #buttons>
      <div v-show="shareHistoryStore.IsListSelected" class="toppanbtn">
        <a-button type="text" size="small" tabindex="-1" title="Ctrl+O" @click="handleOpenLink"><IconFont name="iconchakan" />查看
        </a-button>
        <a-button type="text" size="small" tabindex="-1" title="保存到我的导入" @click="handleSaveMyImport">
          <IconFont name="iconxuanzhuan" />保存导入
        </a-button>
        <a-button type="text" size="small" tabindex="-1" title="Ctrl+C" @click="handleCopySelectedLink"><IconFont name="iconcopy" />复制链接
        </a-button>
        <a-button type="text" size="small" tabindex="-1" title="Ctrl+B" @click="handleBrowserLink"><IconFont name="iconchrome" />浏览器
        </a-button>
      </div>
    </template>

    <template #columns>
      <div :class="'cell count order ' + (shareHistoryStore.ListOrderKey == 'save' ? 'active' : '')"
           @click="handleOrder('save')">
        保存数
        <IconFont name="iconxia" />
      </div>
      <div :class="'cell count order ' + (shareHistoryStore.ListOrderKey == 'preview' ? 'active' : '')"
           @click="handleOrder('preview')">
        预览数
        <IconFont name="iconxia" />
      </div>
      <div :class="'cell count order ' + (shareHistoryStore.ListOrderKey == 'browse' ? 'active' : '')"
           @click="handleOrder('browse')">
        浏览数
        <IconFont name="iconxia" />
      </div>
      <div :class="'cell sharetime order ' + (shareHistoryStore.ListOrderKey == 'ctime' ? 'active' : '')"
           @click="handleOrder('ctime')">
        创建时间
        <IconFont name="iconxia" />
      </div>
      <div :class="'cell sharetime order ' + (shareHistoryStore.ListOrderKey == 'mtime' ? 'active' : '')"
           @click="handleOrder('mtime')">
        修改时间
        <IconFont name="iconxia" />
      </div>
      <div :class="'cell count'">
        创建者
      </div>
    </template>

    <template #row="{ item }">
      <div class="fileicon">
        <IconFont name="iconlink2" aria-hidden="true" />
      </div>
      <div class="filename">
        <div :title="'https://www.aliyundrive.com/s/' + item.share_id" @click="handleOpenLink(item)">
          {{ item.share_name }}
        </div>
      </div>
      <div class="cell sharestate active">{{ item.save_count }}</div>
      <div class="cell sharestate active">{{ item.preview_count }}</div>
      <div class="cell sharestate active">{{ item.browse_count }}</div>
      <div class="cell sharetime">{{ item.gmt_created }}</div>
      <div class="cell sharetime">{{ item.gmt_modified }}</div>
      <div class="cell sharestate">{{ item.creator_name }}</div>
    </template>

    <template #menu>
      <a-doption @click="handleOpenLink">
        <template #icon><IconFont name="iconchakan" /></template>
        <template #default>查看</template>
      </a-doption>
      <a-doption @click="handleSaveMyImport">
        <template #icon><IconFont name="iconxuanzhuan" /></template>
        <template #default>保存导入</template>
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
