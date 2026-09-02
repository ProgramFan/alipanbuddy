<script setup lang="ts">
import { h } from 'vue'
import { IAliShareItem } from '../../aliapi/alimodels'
import { useMyShareStore, useUserStore } from '../../store'
import { KeyboardMessage } from '../../store/keyboardstore'
import { humanCount } from '../../utils/format'
import ShareDAL from './ShareDAL'
import { TestCtrl, TestKey } from '../../utils/keyboardhelper'
import { copyToClipboard, openExternal } from '../../tauri/app'
import message from '../../utils/message'
import AliShare from '../../aliapi/share'

import { modalEditShareLink, modalShowShareLink } from '../../utils/modal'
import { ArrayKeyList } from '../../utils/utils'
import { GetShareUrlFormate } from '../../utils/shareurl'
import { Modal } from '@arco-design/web-vue'
import { t } from '../../i18n'
import ShareListPage from '../ShareListPage.vue'

const myshareStore = useMyShareStore()

const handleRefresh = () => ShareDAL.aReloadMyShare(useUserStore().user_id, true)
const handleOrder = (order: string) => myshareStore.mOrderListData(order)

const handleClickName = (share: IAliShareItem) => {
  handleEdit(share)
}
const handleEdit = (share: any) => {
  let list: IAliShareItem[]
  if (share && share.share_id) {
    list = [share]
  } else {
    list = myshareStore.GetSelected()
  }
  if (list && list.length > 0) modalEditShareLink(list)
  else {
    message.error(t('share.noSelection'))
  }
}
const handleOpenLink = () => {
  const share = myshareStore.GetSelectedFirst()
  if (!share) {
    message.error(t('share.noSelection'))
  } else {
    modalShowShareLink(share.share_id, share.share_pwd, '', false, [])
  }
}
const handleCopySelectedLink = () => {
  const list = myshareStore.GetSelected()
  let link = ''
  for (let i = 0, maxi = list.length; i < maxi; i++) {
    const item = list[i]
    link += GetShareUrlFormate(item.share_name, item.share_url, item.share_pwd) + '\n'
  }
  if (list.length == 0) {
    message.error(t('share.noSelection'))
  } else {
    copyToClipboard(link)
    message.success(`${t('share.linkCopied')}(${list.length.toString()})`)
  }
}
const handleBrowserLink = () => {
  const first = myshareStore.GetSelectedFirst()
  if (!first) return
  if (first.share_url) openExternal(first.share_url)
  if (first.share_pwd) {
    copyToClipboard(first.share_pwd)
    message.success(t('share.codeCopied'))
  }
}
const handleDeleteSelectedLink = (delby: any) => {
  const name = delby == 'selected' ? t('share.cancelSelected') : delby == 'expired' ? t('share.cleanupExpired') : t('share.cleanupDeleted')
  let list: IAliShareItem[]
  if (delby == 'selected') {
    list = myshareStore.GetSelected()
  } else {
    list = []
    const allList = myshareStore.ListDataRaw
    let item: IAliShareItem
    for (let i = 0, maxi = allList.length; i < maxi; i++) {
      item = allList[i]
      if (delby == 'expired') {
        if (item.expired && item.first_file) list.push(item)
      } else {
        if (!item.first_file) list.push(item)
      }
    }
  }
  if (list.length == 0) {
    message.error(t('share.noCleanup'))
    return
  }
  if (delby == 'selected') {
    Modal.open({
      title: name,
      okText: t('share.continue'),
      bodyStyle: { minWidth: '340px' },
      content: () => h('div', {
        style: 'color: var(--md-error)',
        innerText: t('share.irreversible')
      }),
      onOk: async () => {
        const selectKeys = ArrayKeyList<string>('share_id', list)
        AliShare.ApiCancelShareBatch(useUserStore().user_id, selectKeys).then((success: string[]) => {
          useMyShareStore().mDeleteFiles(success)
          message.success(name + t('share.success'))
        })
      }
    })
  } else {
    const selectKeys = ArrayKeyList<string>('share_id', list)
    AliShare.ApiCancelShareBatch(useUserStore().user_id, selectKeys).then((success: string[]) => {
      useMyShareStore().mDeleteFiles(success)
      message.success(name + t('share.success'))
    })
  }
}

const handleShortcuts = (event: KeyboardMessage) => {
  if (TestCtrl('b', event, handleBrowserLink)) return true
  if (TestCtrl('c', event, handleCopySelectedLink)) return true
  if (TestCtrl('Delete', event, () => handleDeleteSelectedLink('selected'))) return true
  if (TestCtrl('e', event, handleEdit)) return true
  return TestKey('f2', event, handleEdit)
}
</script>

<template>
  <ShareListPage :empty="t('share.empty')" :shortcuts="handleShortcuts" :store="myshareStore" :title="t('share.mine')"
                 menu="MyShareRight" menu-id="rightmysharemenu" show-loading @refresh="handleRefresh">
    <template #stats>
      <div class="flex flexnoauto cellcount" :title="t('share.expiringSoon')">
        <a-badge color="#637dff" :text="t('share.expiringSoon') + ' ' + myshareStore.ListStats.expir2day" />
      </div>
      <div class="flex flexnoauto cellcount" :title="t('share.expired')">
        <a-badge color="#637dff" :text="t('share.expired') + ' ' + myshareStore.ListStats.expired" />
      </div>
      <div class="flex flexnoauto cellcount" :title="t('share.forbidden')">
        <a-badge color="#637dff" :text="t('share.forbidden') + ' ' + myshareStore.ListStats.forbidden" />
      </div>
      <div class="flex flexnoauto cellcount" :title="t('share.preview')">
        <a-badge color="#637dff" :text="t('share.preview') + ' ' + myshareStore.ListStats.preview" />
      </div>
      <div class="flex flexnoauto cellcount" :title="t('share.download')">
        <a-badge color="#637dff" :text="t('share.download') + ' ' + myshareStore.ListStats.download" />
      </div>
      <div class="flex flexnoauto cellcount" :title="t('share.save')">
        <a-badge color="#637dff" :text="t('share.save') + ' ' + myshareStore.ListStats.save" />
      </div>
      <div class="flex flexnoauto cellcount" :title="t('share.previewCount')">
        <a-badge color="#637dff" :text="t('share.preview') + ' ' + myshareStore.ListStats.previewMax" />
      </div>
    </template>

    <template #buttons>
      <div v-show="myshareStore.IsListSelected" class="toppanbtn">
        <a-button type="text" size="small" tabindex="-1" title="F2 / Ctrl+E" @click="handleEdit"><IconFont name="iconedit-square" />{{ t('share.edit') }}
        </a-button>
        <a-button type="text" size="small" tabindex="-1" title="Ctrl+O" @click="handleOpenLink"><IconFont name="iconchakan" />{{ t('share.view') }}
        </a-button>
        <a-button type="text" size="small" tabindex="-1" title="Ctrl+C" @click="handleCopySelectedLink"><IconFont name="iconcopy" />{{ t('share.copyLink') }}
        </a-button>
        <a-button type="text" size="small" tabindex="-1" title="Ctrl+B" @click="handleBrowserLink"><IconFont name="iconchrome" />{{ t('share.browser') }}
        </a-button>
        <a-button type="text" size="small" tabindex="-1" class="danger" title="Ctrl+Delete"
                  @click="handleDeleteSelectedLink('selected')"><IconFont name="icondelete" />{{ t('share.cancelShare') }}
        </a-button>
      </div>
      <div v-show="!myshareStore.IsListSelected" class="toppanbtn">
        <a-dropdown trigger="hover" position="bl" @select="handleDeleteSelectedLink">
          <a-button type="text" size="small" tabindex="-1">
            <IconFont name="iconrest" />{{ t('share.cleanupAll') }}
            <IconFont name="icondown" /></a-button>
          <template #content>
            <a-doption :value="'expired'" class="danger">{{ t('share.deleteAllExpired') }}</a-doption>
            <a-doption :value="'deleted'" class="danger">{{ t('share.deleteAllDeleted') }}</a-doption>
          </template>
        </a-dropdown>
      </div>
    </template>

    <template #columns>
      <div class="cell tiquma">{{ t('share.code') }}</div>
      <div :class="'cell sharetime order ' + (myshareStore.ListOrderKey == 'state' ? 'active' : '')"
           @click="handleOrder('state')">
        {{ t('share.validity') }}
        <IconFont name="iconxia" />
      </div>
      <div :class="'cell count order ' + (myshareStore.ListOrderKey == 'preview' ? 'active' : '')"
           @click="handleOrder('preview')">
        {{ t('share.previewCount') }}
        <IconFont name="iconxia" />
      </div>
      <div :class="'cell count order ' + (myshareStore.ListOrderKey == 'download' ? 'active' : '')"
           @click="handleOrder('download')">
        {{ t('share.downloadCount') }}
        <IconFont name="iconxia" />
      </div>
      <div :class="'cell count order ' + (myshareStore.ListOrderKey == 'save' ? 'active' : '')"
           @click="handleOrder('save')">
        {{ t('share.saveCount') }}
        <IconFont name="iconxia" />
      </div>
      <div :class="'cell sharetime order ' + (myshareStore.ListOrderKey == 'time' ? 'active' : '')"
           @click="handleOrder('time')">
        {{ t('share.createdAt') }}
        <IconFont name="iconxia" />
      </div>
    </template>

    <template #row="{ item }">
      <div class="fileicon">
        <IconFont :name="item.icon" aria-hidden="true" />
      </div>
      <div class="filename">
        <div :title="item.share_url || ('https://www.aliyundrive.com/s/' + item.share_id)" @click="handleClickName(item)">
          {{ item.share_name }}
        </div>
      </div>
      <div class="cell tiquma">{{ item.share_pwd }}</div>
      <div v-if="item.status == 'forbidden'" class="cell sharestate forbidden">{{ t('share.forbidden') }}</div>
      <div v-else-if="item.expired" class="cell sharestate expired">{{ t('share.expired') }}</div>
      <div v-else-if="!item.first_file" class="cell sharestate deleted">{{ t('share.deleted') }}</div>
      <div v-else class="cell sharestate active">{{ item.share_msg }}</div>
      <div class="cell count">{{ humanCount(item.preview_count) }}</div>
      <div class="cell count">{{ humanCount(item.download_count) }}</div>
      <div class="cell count">{{ humanCount(item.save_count) }}</div>

      <div class="cell sharetime">{{ item.created_at.replace(' ', '\n') }}</div>
    </template>

    <template #menu>
      <a-doption @click="handleEdit">
        <template #icon><IconFont name="iconedit-square" /></template>
        <template #default>{{ t('share.edit') }}</template>
      </a-doption>
      <a-doption @click="handleOpenLink">
        <template #icon><IconFont name="iconchakan" /></template>
        <template #default>{{ t('share.view') }}</template>
      </a-doption>

      <a-doption @click="handleCopySelectedLink">
        <template #icon><IconFont name="iconcopy" /></template>
        <template #default>{{ t('share.copyLink') }}</template>
      </a-doption>
      <a-doption @click="handleBrowserLink">
        <template #icon><IconFont name="iconchrome" /></template>
        <template #default>{{ t('share.browser') }}</template>
      </a-doption>

      <a-doption class="danger" @click="handleDeleteSelectedLink('selected')">
        <template #icon><IconFont name="icondelete" /></template>
        <template #default>{{ t('share.cancelShare') }}</template>
      </a-doption>
    </template>
  </ShareListPage>
</template>

<style>

</style>
