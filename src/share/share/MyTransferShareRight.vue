<script setup lang="ts">
import { h } from 'vue'
import { IAliShareItem } from '../../aliapi/alimodels'
import { useUserStore } from '../../store'
import { KeyboardMessage } from '../../store/keyboardstore'
import ShareDAL from './ShareDAL'
import { TestCtrl } from '../../utils/keyboardhelper'
import { copyToClipboard, openExternal } from '../../tauri/app'
import message from '../../utils/message'

import { ArrayKeyList } from '../../utils/utils'
import { GetShareUrlFormate } from '../../utils/shareurl'
import useMyTransferShareStore from './MyShareTransferStore'
import AliTransferShare from '../../aliapi/transfershare'
import { Modal } from '@arco-design/web-vue'
import ShareListPage from '../ShareListPage.vue'

const myTransferShare = useMyTransferShareStore()

const handleRefresh = () => ShareDAL.aReloadMyTransferShare(useUserStore().user_id, true)
const handleOrder = (order: string) => myTransferShare.mOrderListData(order)

const handleClickName = (share: any) => {
  let list: IAliShareItem[]
  if (share && share.share_id) {
    list = [share]
  } else {
    list = myTransferShare.GetSelected()
  }
  if (list && list.length > 0) handleBrowserLink()
  else {
    message.error('没有选中任何快传链接！')
  }
}

const handleCopySelectedLink = () => {
  const list = myTransferShare.GetSelected()
  let link = ''
  for (let i = 0, maxi = list.length; i < maxi; i++) {
    const item = list[i]
    link += GetShareUrlFormate(item.share_name, item.share_url, item.share_pwd) + '\n'
  }
  if (list.length == 0) {
    message.error('没有选中快传链接！')
  } else {
    copyToClipboard(link)
    message.success('快传链接已复制到剪切板(' + list.length.toString() + ')')
  }
}
const handleBrowserLink = () => {
  const first = myTransferShare.GetSelectedFirst()
  if (!first) return
  if (first.share_url) {
    openExternal(first.share_url)
  }
}
const handleDeleteSelectedLink = (delby: any) => {
  const name = delby == 'selected' ? '取消选中的快传' : delby == 'expired' ? '清理全部过期已失效' : '清理全部文件已删除'
  let list: IAliShareItem[]
  if (delby == 'selected') {
    list = myTransferShare.GetSelected()
  } else {
    list = []
    const allList = myTransferShare.ListDataRaw
    let item: IAliShareItem
    for (let i = 0, maxi = allList.length; i < maxi; i++) {
      item = allList[i]
      if (delby == 'expired') {
        if (item.expired) list.push(item)
      }
    }
  }
  if (list.length == 0) {
    message.error('没有需要清理的快传链接！')
    return
  }
  if (delby == 'selected') {
    Modal.open({
      title: name,
      okText: '继续',
      bodyStyle: { minWidth: '340px' },
      content: () => h('div', {
        style: 'color: var(--md-error)',
        innerText: '该操作不可逆，是否继续？'
      }),
      onOk: async () => {
        const selectKeys = ArrayKeyList<string>('share_id', list)
        AliTransferShare.ApiCancelTransferShareBatch(useUserStore().user_id, selectKeys).then((success: string[]) => {
          myTransferShare.mDeleteFiles(success)
          message.success(name + '成功！')
        })
      }
    })
  } else {
    const selectKeys = ArrayKeyList<string>('share_id', list)
    AliTransferShare.ApiCancelTransferShareBatch(useUserStore().user_id, selectKeys).then((success: string[]) => {
      myTransferShare.mDeleteFiles(success)
      message.success(name + '成功！')
    })
  }
}

const handleShortcuts = (event: KeyboardMessage) => {
  if (TestCtrl('b', event, handleBrowserLink)) return true
  if (TestCtrl('c', event, handleCopySelectedLink)) return true
  return TestCtrl('Delete', event, () => handleDeleteSelectedLink('selected'))
}
</script>

<template>
  <ShareListPage :shortcuts="handleShortcuts" :store="myTransferShare" empty="没创建过任何快传链接"
                 menu="MyTransferShareRight" menu-id="rightmytransfersharemenu" show-loading title="我的快传"
                 @refresh="handleRefresh">
    <template #stats>
      <div class="flex flexnoauto cellcount" title="2天内过期">
        <a-badge color="#637dff" :text="'临期 ' + myTransferShare.ListStats.expir2day" />
      </div>
      <div class="flex flexnoauto cellcount" title="总过期">
        <a-badge color="#637dff" :text="'过期 ' + myTransferShare.ListStats.expired" />
      </div>
      <div class="flex flexnoauto cellcount" title="总违规">
        <a-badge color="#637dff" :text="'违规 ' + myTransferShare.ListStats.forbidden" />
      </div>
    </template>

    <template #buttons>
      <div v-if="!myTransferShare.IsListSelected" class="toppanbtn">
        <a-button class="danger" type="text" size="small" tabindex="-1"
                  @click="handleDeleteSelectedLink">
          <IconFont name="iconrest" />删除过期
        </a-button>
      </div>
      <div v-show="myTransferShare.IsListSelected" class="toppanbtn">
        <a-button type="text" size="small" tabindex="-1" title="Ctrl+O" @click="handleClickName"><IconFont name="iconchakan" />查看
        </a-button>
        <a-button type="text" size="small" tabindex="-1" title="Ctrl+C" @click="handleCopySelectedLink"><IconFont name="iconcopy" />复制链接
        </a-button>
        <a-button type="text" size="small" tabindex="-1" title="Ctrl+B" @click="handleBrowserLink"><IconFont name="iconchrome" />浏览器
        </a-button>
        <a-button type="text" size="small" tabindex="-1" class="danger" title="Ctrl+Delete"
                  @click="handleDeleteSelectedLink('selected')"><IconFont name="icondelete" />取消快传
        </a-button>
      </div>
    </template>

    <template #columns>
      <div :class="'cell sharetime order ' + (myTransferShare.ListOrderKey == 'state' ? 'active' : '')"
           @click="handleOrder('state')">
        有效期
        <IconFont name="iconxia" />
      </div>
      <div :class="'cell sharetime order ' + (myTransferShare.ListOrderKey == 'save' ? 'active' : '')"
           @click="handleOrder('save')">
        保存情况
        <IconFont name="iconxia" />
      </div>
      <div :class="'cell sharetime order ' + (myTransferShare.ListOrderKey == 'time' ? 'active' : '')"
           @click="handleOrder('time')">
        创建时间
        <IconFont name="iconxia" />
      </div>
    </template>

    <template #row="{ item }">
      <div class="fileicon">
        <IconFont :name="item.icon" aria-hidden="true" />
      </div>
      <div class="filename">
        <div :title="'https://www.aliyundrive.com/t/' + item.share_id" @click="handleClickName(item)">
          {{ item.share_name }}
        </div>
      </div>
      <div v-if="item.status == 'forbidden'" class="cell sharestate forbidden">分享违规</div>
      <div v-else-if="item.expired" class="cell sharestate expired">过期失效</div>
      <div v-else-if="!item.first_file" class="cell sharestate deleted">文件已删</div>
      <div v-else class="cell sharestate active">{{ item.share_msg }}</div>
      <div class="cell sharestate active">{{ item.share_saved }}</div>
      <div class="cell sharetime">{{ item.created_at.replace(' ', '\n') }}</div>
    </template>

    <template #menu>
      <a-doption @click="handleClickName">
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
      <a-doption class="danger" @click="handleDeleteSelectedLink('selected')">
        <template #icon><IconFont name="icondelete" /></template>
        <template #default>取消快传</template>
      </a-doption>
    </template>
  </ShareListPage>
</template>

<style>

</style>
