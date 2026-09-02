<script setup lang='ts'>
import { computed } from 'vue'

import {
  menuAddAlbumSelectFile,
  menuCopyFileName,
  menuCopyFileTree,
  menuCopySelectedFile,
  menuCreatShare,
  menuDownload,
  menuFavSelectFile,
  menuFileClearHistory,
  menuFileColorChange,
  menuFileEncTypeChange,
  menuJumpToDir,
  menuTrashSelectFile
} from '../topbtns/topbtn'
import { modalRename, modalShuXing } from '../../utils/modal'
import { t } from '../../i18n'

const props = defineProps({
  dirtype: {
    type: String,
    required: true
  },
  isselected: {
    type: Boolean,
    required: true
  },
  isselectedmulti: {
    type: Boolean,
    required: true
  },
  isallfavored: {
    type: Boolean,
    required: true
  },
  isallcolored: {
    type: Boolean,
    required: true
  },
  inputselectType: {
    type: String,
    required: true
  },
  inputpicType: {
    type: String,
    required: true
  }
})

const istree = false
const isShowBtn = computed(() => {
  return (props.dirtype === 'pic' && props.inputpicType != 'mypic')
    || props.dirtype === 'mypic' || ['search', 'color', 'pan'].includes(props.dirtype)
})
const isPic = computed(() => {
  return (props.dirtype === 'pic' && props.inputpicType == 'mypic')
})
</script>

<template>
  <div v-show="isselected && dirtype !== 'trash' && dirtype !== 'recover'" class='toppanbtn'>
    <a-button v-if='!isPic && dirtype != "video"' type='text' size='small' tabindex='-1' title='Ctrl+D'
              @click='() => menuDownload(istree)'>
      <IconFont name="icondownload" />{{ t('file.download') }}
    </a-button>
    <a-button v-if="!isPic && dirtype != 'video' && dirtype !== 'search'" type='text' size='small' tabindex='-1'
              title='Ctrl+S'
              @click="() => menuCreatShare(istree, 'pan', 'resource_root')">
      <IconFont name="iconfenxiang" />{{ t('file.share') }}
    </a-button>
    <a-button v-if='!isPic && dirtype != "video" && dirtype !== "search"' type='text' size='small' tabindex='-1' title='Ctrl+T'
              @click="() => menuCreatShare(istree, 'pan', 'backup_root')">
      <IconFont name="iconrss" />{{ t('file.quickTransfer') }}
    </a-button>
    <a-button v-if='!isPic && !isallfavored' type='text' size='small' tabindex='-1' title='Ctrl+G'
              @click='() => menuFavSelectFile(istree, true)'>
      <IconFont name="iconcrown" />{{ t('file.favorite') }}
    </a-button>
    <a-button v-if='!isPic && isallfavored' type='text' size='small' tabindex='-1' title='Ctrl+G'
              @click='() => menuFavSelectFile(istree, false)'>
      <IconFont name="iconcrown2" />{{ t('file.unfavorite') }}
    </a-button>
    <a-button v-if='isShowBtn' title='F2 / Ctrl+E' type='text' size='small' tabindex='-1'
              @click='() => modalRename(istree, isselectedmulti, isPic)'>
      <IconFont name="iconedit-square" />{{ t('file.rename') }}
    </a-button>
    <a-button v-if="isselected && !isselectedmulti && (dirtype == 'favorite' || dirtype == 'search' || dirtype == 'color' || dirtype == 'trash' || dirtype == 'video')"
              type='text' size='small' tabindex='-1' title='Ctrl+R'
              @click='() => menuJumpToDir()'>
      <IconFont name="icondakaiwenjianjia1" />{{ t('file.openLocation') }}
    </a-button>
    <a-dropdown v-if="dirtype !== 'video' && dirtype !== 'mypic'" trigger='hover' class='rightmenu' position='bl'>
      <a-button type='text' size='small' tabindex='-1' class='danger'>
        <IconFont name="icondelete" />{{ t('file.delete') }}<IconFont name="icondown" />
      </a-button>
      <template #content>
        <a-doption v-show='isShowBtn || dirtype === "search"' title='Ctrl+Delete' class='danger'
                   @click='() => menuTrashSelectFile(istree, false, isPic)'>
          <template #icon><IconFont name="icondelete" /></template>
          <template #default>{{ t('file.trash') }}</template>
        </a-doption>
        <a-dsubmenu class='rightmenu' trigger='hover'>
          <template #default>
            <span class='arco-dropdown-option-icon'><IconFont name="iconrest" /></span>{{ t('file.deletePermanently') }}
          </template>
          <template #content>
            <a-doption title='Ctrl+Shift+Delete' class='danger' @click='() => menuTrashSelectFile(istree, true, isPic)'>
              <template #default>{{ t('file.cannotRestore') }}</template>
            </a-doption>
          </template>
        </a-dsubmenu>
      </template>
    </a-dropdown>

    <a-dropdown trigger='hover' class='rightmenu' position='bl'>
      <a-button type='text' size='small' tabindex='-1'>{{ t('file.more') }}<IconFont name="icondown" /></a-button>
      <template #content>
        <a-doption v-show='inputpicType !== "mypic" && dirtype === "pic"'
                   title='Ctrl+X' @click="() => menuAddAlbumSelectFile()">
          <template #icon><IconFont name="iconscissor" /></template>
          <template #default>{{ t('file.moveToAlbum') }}</template>
        </a-doption>
        <a-doption v-show='dirtype === "mypic"' title='Ctrl+X'
                   @click="() => menuTrashSelectFile(istree, false, true)">
          <template #icon><IconFont name="iconscissor" /></template>
          <template #default>{{ t('file.removeFromAlbum') }}</template>
        </a-doption>
        <a-doption v-show='isShowBtn' title='Ctrl+X' @click="() => menuCopySelectedFile(istree, 'cut')">
          <template #icon><IconFont name="iconscissor" /></template>
          <template #default>{{ t('file.moveTo') }}</template>
        </a-doption>
        <a-doption v-show='isShowBtn' title='Ctrl+C' @click="() => menuCopySelectedFile(istree, 'copy')">
          <template #icon><IconFont name="iconcopy" /></template>
          <template #default>{{ t('file.copyTo') }}</template>
        </a-doption>
        <a-doption v-show='!isPic' title='Ctrl+P' @click='() => modalShuXing(istree, dirtype.includes("pic"))'>
          <template #icon><IconFont name="iconshuxing" /></template>
          <template #default>{{ t('file.properties') }}</template>
        </a-doption>
        <a-doption v-show='isShowBtn' type='text' size='small' tabindex='-1' title='Ctrl+M'
                   @click="() => menuFileEncTypeChange(istree)">
          <template #icon><IconFont name="iconsafebox" /></template>
          <template #default>{{ t('file.markEncrypted') }}</template>
        </a-doption>
        <a-doption v-show='isShowBtn && isallcolored' type='text' size='small' tabindex='-1' title='Ctrl+M'
                   @click="() => menuFileClearHistory(istree)">
          <template #icon><IconFont name="iconshipin" /></template>
          <template #default>{{ t('file.clearHistory') }}</template>
        </a-doption>
        <a-doption v-show='isShowBtn && isallcolored' type='text' size='small' tabindex='-1' title='Ctrl+M'
                   @click="() => menuFileColorChange(istree, '')">
          <template #icon><IconFont name="iconfangkuang" /></template>
          <template #default>{{ t('file.clearMark') }}</template>
        </a-doption>
        <a-doption v-show='isselected' @click='() => menuCopyFileName()'>
          <template #icon><IconFont name="iconlist" /></template>
          <template #default>{{ t('file.copyName') }}</template>
        </a-doption>
        <a-doption v-show='!dirtype.includes("pic") && isselected && !isselectedmulti'
                   @click='() => menuCopyFileTree()'>
          <template #icon><IconFont name="iconnode-tree1" /></template>
          <template #default>{{ t('file.copyTree') }}</template>
        </a-doption>
      </template>
    </a-dropdown>
  </div>
</template>
<style></style>
