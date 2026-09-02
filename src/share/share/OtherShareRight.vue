<script setup lang="ts">
import { h, ref } from 'vue'
import { IOtherShareLinkModel, useOtherShareStore } from '../../store'
import { KeyboardMessage } from '../../store/keyboardstore'
import ShareDAL from './ShareDAL'
import { TestCtrl } from '../../utils/keyboardhelper'
import { copyToClipboard, openExternal, readClipboardText } from '../../tauri/app'
import message from '../../utils/message'

import { modalSelectPanDir, modalShowShareLink } from '../../utils/modal'
import { ArrayKeyList } from '../../utils/utils'
import { GetShareUrlFormate } from '../../utils/shareurl'
import { Modal } from '@arco-design/web-vue'
import AliShare from '../../aliapi/share'
import PanDAL from '../../pan/pandal'
import { t } from '../../i18n'
import ShareListPage from '../ShareListPage.vue'

const daoruModel = ref(false)
const daoruModelLoading = ref(false)
const daoruModelText = ref('')

const othershareStore = useOtherShareStore()
const shareUrl = (share: IOtherShareLinkModel) => `https://www.aliyundrive.com/s/${share.share_id}`

const handleRefresh = () => ShareDAL.aReloadOtherShare()
const handleOrder = (order: string) => othershareStore.mOrderListData(order)

const handleOpenLink = (share: any) => {
  if (share && share.share_id) {
    // donothing
  } else {
    share = othershareStore.GetSelectedFirst()
  }
  if (!share.share_id) {
    message.error(t('share.selectShareFirst'))
  } else {
    modalShowShareLink(share.share_id, share.share_pwd, '', true, [])
  }
}
const handleCopySelectedLink = () => {
  const list = othershareStore.GetSelected()
  let link = ''
  for (let i = 0, maxi = list.length; i < maxi; i++) {
    const item = list[i]
    link += GetShareUrlFormate(item.share_name, shareUrl(item), item.share_pwd) + '\n'
  }
  if (list.length == 0) {
    message.error(t('share.selectShareFirst'))
  } else {
    copyToClipboard(link)
    message.success(`${t('share.linkCopied')}(${list.length.toString()})`)
  }
}
const handleBrowserLink = () => {
  const first = othershareStore.GetSelectedFirst()
  if (!first) return
  if (first.share_id) openExternal(shareUrl(first))
  if (first.share_pwd) {
    copyToClipboard(first.share_pwd)
    message.success(t('share.codeCopied'))
  }
}

const handleDeleteSelectedLink = (delby: any) => {
  const name = delby == 'selected' ? t('share.deleteSelectedLinks') : delby == 'expired' ? t('share.cleanupExpired') : ''
  let list: IOtherShareLinkModel[] = []
  if (delby == 'selected') {
    list = othershareStore.GetSelected()
  } else {
    list = []
    const allList = othershareStore.ListDataRaw
    let item: IOtherShareLinkModel
    for (let i = 0, maxi = allList.length; i < maxi; i++) {
      item = allList[i]
      if (delby == 'expired') {
        if (item.expired) list.push(item)
      }
    }
  }
  if (list.length == 0) {
    message.error(t('share.noDeleteNeeded'))
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
        ShareDAL.DeleteOtherShare(selectKeys).then(() => {
          message.success(`${t('share.deletedCount')}${selectKeys.length}${t('share.items')}`)
        })
      }
    })
  } else {
    const selectKeys = ArrayKeyList<string>('share_id', list)
    ShareDAL.DeleteOtherShare(selectKeys).then(() => {
      message.success(`${t('share.deletedCount')}${selectKeys.length}${t('share.items')}`)
    })
  }
}
const handleDaoRuLink = async () => {
  daoruModel.value = true
  const txt = await readClipboardText()
  if (txt.indexOf('.aliyundrive.com/s/') > 0 || txt.indexOf('.alipan.com/s/') > 0) {
    daoruModelText.value = txt
    setTimeout(() => {
      document.getElementById('OSRDaoRuLink')?.focus()
    }, 200)
  }
}

const handleSaveDaoRuLink = () => {
  const text = daoruModelText.value
  if (!text) {
    message.error(t('share.pasteImportFirst'))
    return
  }
  daoruModelLoading.value = true
  ShareDAL.SaveOtherShareText(text).then((success: boolean) => {
    daoruModelLoading.value = false
    if (success) {
      daoruModelText.value = ''
      daoruModel.value = false
    }
  })
}
const handleRefreshStats = () => {
  ShareDAL.SaveOtherShareRefresh()
}

const handleBatchSaveSelected = () => {
  const list = othershareStore.GetSelected()
  if (!list.length) {
    message.error(t('share.selectShareFirst'))
    return
  }
  modalSelectPanDir('share', '', async function(user_id: string, drive_id: string, selectFile: any) {
    if (!drive_id || !selectFile.drive_id || !selectFile.file_id) return
    let success = 0
    const errors: string[] = []
    for (const share of list) {
      const shareToken = await AliShare.ApiGetShareToken(share.share_id, share.share_pwd)
      if (!shareToken || shareToken.startsWith('，')) {
        errors.push(`${share.share_name}: ${shareToken || t('share.getTokenFailed')}`)
        continue
      }
      const files = await AliShare.ApiShareFileList(share.share_id, shareToken, 'root')
      if (files.next_marker) {
        errors.push(`${share.share_name}: ${files.next_marker}`)
        continue
      }
      const ids = files.items.map(item => item.file_id)
      const save = await AliShare.ApiSaveShareFilesBatch(share.share_id, shareToken, user_id, selectFile.drive_id, selectFile.file_id, ids)
      if (save === 'success' || save === 'async') success += 1
      else errors.push(`${share.share_name}: ${save}`)
    }
    if (success) {
      message.success(`${t('share.batchSaveDone')} ${success}/${list.length}, ${t('share.refreshTargetFolderLater')}`)
      await PanDAL.aReLoadOneDirToRefreshTree(user_id, selectFile.drive_id, selectFile.file_id)
    }
    if (errors.length) message.error(`${t('share.batchSaveFailed')} ${errors.length}${t('share.items')}: ${errors.slice(0, 3).join('; ')}`)
  })
}

const handleShortcuts = (event: KeyboardMessage) => {
  if (TestCtrl('b', event, handleBrowserLink)) return true
  if (TestCtrl('c', event, handleCopySelectedLink)) return true
  if (TestCtrl('Delete', event, () => handleDeleteSelectedLink('selected'))) return true
  if (TestCtrl('n', event, handleDaoRuLink)) return true
  return TestCtrl('u', event, handleRefreshStats)
}
</script>

<template>
  <ShareListPage :empty="t('share.neverImported')" :enter-fun="handleOpenLink" :shortcuts="handleShortcuts"
                 :store="othershareStore" :title="t('share.importedTitle')" menu="OtherShareRight"
                 menu-id="rightothersharemenu" @refresh="handleRefresh">
    <template #buttons>
      <div class="toppanbtn">
        <a-button type="text" size="small" tabindex="-1" title="Ctrl+N" @click="handleDaoRuLink">
          <IconFont name="iconlink2" />{{ t('file.importShare') }}
        </a-button>
        <a-button type="text" size="small" tabindex="-1" title="Ctrl+U" @click="handleRefreshStats">
          <IconFont name="iconyibu" />{{ t('share.refreshStats') }}
        </a-button>
        <a-button v-if="!othershareStore.IsListSelected"
                  class="danger" type="text" size="small" tabindex="-1"
                  @click="handleDeleteSelectedLink">
          <IconFont name="iconrest" />{{ t('share.deleteExpired') }}
        </a-button>
      </div>
      <div v-show="othershareStore.IsListSelected" class="toppanbtn">
        <a-button type="text" size="small" tabindex="-1" title="Ctrl+O" @click="handleOpenLink">
          <IconFont name="iconchakan" />{{ t('share.view') }}
        </a-button>
        <a-button type="text" size="small" tabindex="-1" title="Ctrl+C" @click="handleCopySelectedLink">
          <IconFont name="iconcopy" />{{ t('share.copyLink') }}
        </a-button>
        <a-button type="text" size="small" tabindex="-1" title="Ctrl+B" @click="handleBrowserLink">
          <IconFont name="iconchrome" />{{ t('share.browser') }}
        </a-button>
        <a-button type="text" size="small" tabindex="-1" @click="handleBatchSaveSelected">
          <IconFont name="iconxuanzhuan" />{{ t('share.batchSave') }}
        </a-button>
        <a-button type="text" size="small" tabindex="-1" class="danger" title="Ctrl+Delete"
                  @click="handleDeleteSelectedLink('selected')">
          <IconFont name="icondelete" />{{ t('file.delete') }}
        </a-button>
      </div>
    </template>

    <template #columns>
      <div class="cell tiquma">{{ t('share.extractCode') }}</div>
      <div :class="'cell sharestate order ' + (othershareStore.ListOrderKey == 'state' ? 'active' : '')"
           @click="handleOrder('state')">
        {{ t('share.status') }}
        <IconFont name="iconxia" />
      </div>
      <div :class="'cell sharetime order ' + (othershareStore.ListOrderKey == 'time' ? 'active' : '')"
           @click="handleOrder('time')">
        {{ t('share.importedAt') }}
        <IconFont name="iconxia" />
      </div>
    </template>

    <template #row="{ item }">
      <div class="fileicon">
        <IconFont name="iconlink2" aria-hidden="true" />
      </div>
      <div class="filename">
        <div :title="shareUrl(item)" @click="handleOpenLink(item)">
          {{ item.share_name }}
        </div>
      </div>
      <div class="cell tiquma">{{ item.share_pwd }}</div>
      <div v-if="item.expired" class="cell sharestate expired">{{ t('share.expiredInvalid') }}</div>
      <div v-else-if="item.share_msg == '已失效'" class="cell sharestate expired">{{ t('share.invalid') }}</div>
      <div v-else class="cell sharestate active">{{ item.share_msg }}</div>

      <div class="cell sharetime">{{ item.saved_at.replace(' ', '\n') }}</div>
    </template>

    <template #menu>
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
      <a-doption @click="handleBatchSaveSelected">
        <template #icon><IconFont name="iconxuanzhuan" /></template>
        <template #default>{{ t('share.batchSave') }}</template>
      </a-doption>

      <a-doption class="danger" @click="handleDeleteSelectedLink('selected')">
        <template #icon><IconFont name="icondelete" /></template>
        <template #default>{{ t('share.deleteRecord') }}</template>
      </a-doption>
    </template>

    <a-modal v-model:visible="daoruModel" :footer="false" :unmount-on-close="true" :mask-closable="false">
      <template #title> {{ t('share.batchImportRecords') }}</template>
      <div style="width: 500px">
        <div style="margin-bottom: 32px">
          <div class="arco-textarea-wrapper arco-textarea-scroll">
            <textarea v-model="daoruModelText" class="arco-textarea daoruinput"
                      :placeholder="t('share.pasteLinksPlaceholder')"></textarea>
          </div>
          <div>
            <span class="oporg">{{ t('share.recordOnlyNote') }}</span>
          </div>
        </div>
        <div class="flex" style="justify-content: center; align-items: center; margin-bottom: 0px">
          <a-button id="OSRDaoRuLink" type="primary" size="small" tabindex="-1" :loading="daoruModelLoading"
                    @click="handleSaveDaoRuLink">{{ t('share.batchImport') }}
          </a-button>
        </div>
      </div>
    </a-modal>
  </ShareListPage>
</template>

<style></style>
