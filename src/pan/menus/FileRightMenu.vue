<script setup lang='ts'>
import {
  menuAddAlbumSelectFile,
  menuCopyFileName,
  menuCopyFileTree,
  menuCopySelectedFile,
  menuCreatShare,
  menuDownload,
  menuFileClearHistory,
  menuFileColorChange,
  menuFileEncTypeChange,
  menuJumpToDir,
  menuTrashSelectFile
} from '../topbtns/topbtn'
import { modalRename, modalShuXing } from '../../utils/modal'
import { useSettingStore } from '../../store'
import { computed } from 'vue'
import { t } from '../../i18n'

let istree = false
const settingStore = useSettingStore()

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
  inputselectType: {
    type: String,
    required: true
  },
  inputpicType: {
    type: String,
    required: true
  }
})

const isShowBtn = computed(() => {
  return (props.dirtype === 'pic' && props.inputpicType != 'mypic')
    || props.dirtype === 'mypic' || props.dirtype === 'pan'
})
const isPic = computed(() => {
  return (props.dirtype === 'pic' && props.inputpicType == 'mypic')
})
</script>

<template>
  <a-dropdown id='rightpanmenu' class='rightmenu' :popup-visible='true' style='z-index: -1; left: -200px; opacity: 0'>
    <template #content>
      <a-doption @click='() => menuDownload(istree)'>
        <template #icon><IconFont name="icondownload" /></template>
        <template #default>{{ t('file.download') }}</template>
      </a-doption>
      <a-doption @click="() => menuCreatShare(istree, 'pan', 'resource_root')">
        <template #icon><IconFont name="iconfenxiang" /></template>
        <template #default>{{ t('file.share') }}</template>
      </a-doption>
      <a-doption @click="() => menuCreatShare(istree, 'pan', 'backup_root')">
        <template #icon><IconFont name="iconrss" /></template>
        <template #default>{{ t('file.quickTransfer') }}</template>
      </a-doption>

      <a-dsubmenu v-if="dirtype !== 'pic'" id='rightpansubbiaoji' class='rightmenu' trigger='hover'>
        <template #default>
          <div @click.stop='() => {}'>
            <span class='arco-dropdown-option-icon'>
              <IconFont name="iconwbiaoqian" style='opacity: 0.8' />
            </span>{{ t('file.mark') }}
          </div>
        </template>
        <template #content>
          <a-doption v-for='item in settingStore.uiFileColorArray' :key='item.key'
                     @click='() => menuFileColorChange(istree, item.key)'>
            <template #icon><IconFont name="iconcheckbox-full" :style='{ color: item.key }' /></template>
            <template #default>{{ item.title || item.key }}</template>
          </a-doption>

          <a-doption @click="() => menuFileColorChange(istree, '#e74c3c')">
            <template #icon><IconFont name="iconcheckbox-full" style='color: #e74c3c' /></template>
            <template #default>{{ t('file.videoRed') }}</template>
          </a-doption>
          <a-doption @click="() => menuFileColorChange(istree, '')">
            <template #icon><IconFont name="iconfangkuang" /></template>
            <template #default>{{ t('file.clearMark') }}</template>
          </a-doption>
        </template>
      </a-dsubmenu>
      <a-dsubmenu v-if="dirtype != 'video'" id='rightpansubmove' class='rightmenu' trigger='hover'>
        <template #default>
          <div @click.stop='() => {}'>
            <span class='arco-dropdown-option-icon'>
              <IconFont name="iconmoveto" style='opacity: 0.8' />
            </span>
            {{ t('file.operations') }}
          </div>
        </template>
        <template #content>
          <a-doption v-show='isShowBtn && inputpicType !== "mypic" && dirtype !== "pan"'
                     @click='() => menuAddAlbumSelectFile()'>
            <template #icon><IconFont name="iconmoveto" /></template>
            <template #default>{{ t('file.moveToAlbum') }}</template>
          </a-doption>
          <a-doption v-show='dirtype === "mypic"'
                     @click='() => menuTrashSelectFile(istree, false, true)'>
            <template #icon><IconFont name="iconqingkong" /></template>
            <template #default>{{ t('file.removeFromAlbum') }}</template>
          </a-doption>
          <a-doption v-show='isShowBtn' @click="() => menuCopySelectedFile(istree, 'cut')">
            <template #icon><IconFont name="iconscissor" /></template>
            <template #default>{{ t('file.moveTo') }}</template>
          </a-doption>
          <a-doption v-show='isShowBtn' @click="() => menuCopySelectedFile(istree, 'copy')">
            <template #icon><IconFont name="iconcopy" /></template>
            <template #default>{{ t('file.copyTo') }}</template>
          </a-doption>
          <a-doption v-show='isShowBtn' type='text' size='small' tabindex='-1' title='Ctrl+M'
                     @click="() => menuFileEncTypeChange(istree)">
            <template #icon><IconFont name="iconsafebox" /></template>
            <template #default>{{ t('file.markEncrypted') }}</template>
          </a-doption>
          <a-doption v-show='(isShowBtn && dirtype !== "mypic") || dirtype === "search"' class='danger' @click='() => menuTrashSelectFile(istree, false, isPic)'>
            <template #icon><IconFont name="icondelete" /></template>
            <template #default>{{ t('file.trash') }}</template>
          </a-doption>
          <a-dsubmenu v-if='dirtype !== "mypic"' class='rightmenu' trigger='hover'>
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
      </a-dsubmenu>

      <a-doption v-show="dirtype != 'video'"
                 @click='() => modalRename(istree, isselectedmulti, dirtype.includes("pic"))'>
        <template #icon><IconFont name="iconedit-square" /></template>
        <template #default>{{ t('file.rename') }}</template>
      </a-doption>

      <a-doption v-show="!isPic" @click='() => modalShuXing(istree, dirtype.includes("pic"))'>
        <template #icon><IconFont name="iconshuxing" /></template>
        <template #default>{{ t('file.properties') }}</template>
      </a-doption>
      <a-dsubmenu v-if='!dirtype.includes("pic")'
                  id='rightpansubmore' class='rightmenu' trigger='hover'>
        <template #default>
          <div @click.stop='() => {}'>
            <span class='arco-dropdown-option-icon'>
              <IconFont name="icongengduo1" style='opacity: 0.8' />
            </span>
            {{ t('file.more') }}
          </div>
        </template>
        <template #content>
          <a-doption
            v-show="isselected && !isselectedmulti && (dirtype == 'favorite' || dirtype == 'search' || dirtype == 'color' || dirtype == 'video')"
            @click='() => menuJumpToDir()'>
            <template #icon><IconFont name="icondakaiwenjianjia1" /></template>
            <template #default>{{ t('file.openLocation') }}</template>
          </a-doption>
          <a-doption v-show='isShowBtn' type='text' size='small' tabindex='-1' title='Ctrl+M'
                     @click="() => menuFileEncTypeChange(istree)">
            <template #icon><IconFont name="iconsafebox" /></template>
            <template #default>{{ t('file.markEncrypted') }}</template>
          </a-doption>
          <a-doption v-show='isShowBtn' type='text' size='small' tabindex='-1' title='Ctrl+M'
                     @click="() => menuFileClearHistory(istree)">
            <template #icon><IconFont name="iconshipin" /></template>
            <template #default>{{ t('file.clearHistory') }}</template>
          </a-doption>
          <a-doption v-show='isselected' @click='() => menuCopyFileName()'>
            <template #icon><IconFont name="iconlist" /></template>
            <template #default>{{ t('file.copyName') }}</template>
          </a-doption>
          <a-doption v-show='isselected && !isselectedmulti'
                     @click='() => menuCopyFileTree()'>
            <template #icon><IconFont name="iconnode-tree1" /></template>
            <template #default>{{ t('file.copyTree') }}</template>
          </a-doption>
        </template>
      </a-dsubmenu>
    </template>
  </a-dropdown>
</template>
