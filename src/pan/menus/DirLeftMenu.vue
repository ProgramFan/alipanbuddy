<script setup lang="ts">
import { menuCopySelectedFile, menuCreatShare, menuDownload, menuTrashSelectFile } from '../topbtns/topbtn'
import { modalRename, modalShuXing } from '../../utils/modal'
import PanDAL from '../pandal'
import { usePanTreeStore } from '../../store'
import TreeStore from '../../store/treestore'
import { t } from '../../i18n'

const istree = true
const pantreeStore = usePanTreeStore()

defineProps({
  inputselectType: {
    type: String,
    required: true
  }
})

const handleRefresh = () => PanDAL.aReLoadOneDirToShow('', 'refresh', false)
const handleExpandAll = (isExpand: boolean) => {
  const drive_id = pantreeStore.drive_id
  const file_id = pantreeStore.selectDir.file_id
  const diridList = (() => {
    const result: string[] = []
    const visited = new Set<string>()
    const stack = [file_id]
    while (stack.length > 0) {
      const current = stack.pop() as string
      const children = TreeStore.GetDirChildDirID(drive_id, current)
      for (let i = 0; i < children.length; i++) {
        const child = children[i]
        if (visited.has(child)) continue
        visited.add(child)
        result.push(child)
        stack.push(child)
      }
    }
    return result
  })()
  pantreeStore.mTreeExpandAll(diridList, isExpand)
}
</script>

<template>
  <a-dropdown id="leftpanmenu" class="rightmenu" :popup-visible="true" style="z-index: -1; left: -200px; opacity: 0">
    <template #content>
      <a-dsubmenu id="leftpansubzhankai" class="rightmenu" trigger="hover">
        <template #default>
          <div @click.stop="() => {}">
            <span class="arco-dropdown-option-icon"><IconFont name="iconfenzhi1" /></span>{{ t('file.directory') }}
          </div>
        </template>
        <template #content>
          <a-doption @click="handleRefresh">
            <template #icon> <IconFont name="iconreload-1-icon" /> </template>
            <template #default>{{ t('file.refresh') }}</template>
          </a-doption>
          <a-doption @click="() => handleExpandAll(true)">
            <template #icon> <IconFont name="iconArrow-Down2" /> </template>
            <template #default>{{ t('file.expandAll') }}</template>
          </a-doption>
          <a-doption @click="() => handleExpandAll(false)">
            <template #icon> <IconFont name="iconArrow-Right2" /> </template>
            <template #default>{{ t('file.collapseAll') }}</template>
          </a-doption>
        </template>
      </a-dsubmenu>
      <a-doption @click="() => menuDownload(istree)">
        <template #icon> <IconFont name="icondownload" /> </template>
        <template #default>{{ t('file.download') }}</template>
      </a-doption>
      <a-doption @click="() => menuCreatShare(istree, 'pan', 'resource_root')">
        <template #icon><IconFont name="iconfenxiang" /></template>
        <template #default>分享</template>
      </a-doption>
      <a-doption @click="() => menuCreatShare(istree, 'pan', 'backup_root')">
        <template #icon><IconFont name="iconrss" /></template>
        <template #default>{{ t('file.quickTransfer') }}</template>
      </a-doption>

      <a-dsubmenu id="leftpansubmove" class="rightmenu" trigger="hover">
        <template #default>
          <div @click.stop="() => {}">
            <span class="arco-dropdown-option-icon"><IconFont name="iconmoveto" style="opacity: 0.8" /></span>{{ t('file.operations') }}
          </div>
        </template>
        <template #content>
          <a-doption @click="() => menuCopySelectedFile(istree, 'cut')">
            <template #icon> <IconFont name="iconscissor" /> </template>
            <template #default>{{ t('file.moveTo') }}</template>
          </a-doption>
          <a-doption @click="() => menuCopySelectedFile(istree, 'copy')">
            <template #icon> <IconFont name="iconcopy" /> </template>
            <template #default>{{ t('file.copyTo') }}</template>
          </a-doption>
          <a-doption class="danger" @click="() => menuTrashSelectFile(istree, false)">
            <template #icon> <IconFont name="icondelete" /> </template>
            <template #default>{{ t('file.trash') }}</template>
          </a-doption>
        </template>
      </a-dsubmenu>

      <a-doption @click='() => modalRename(istree, false, false)'>
        <template #icon><IconFont name="iconedit-square" /></template>
        <template #default>{{ t('file.rename') }}</template>
      </a-doption>

      <a-doption @click='() => modalShuXing(istree)'>
        <template #icon><IconFont name="iconshuxing" /></template>
        <template #default>{{ t('file.properties') }}</template>
      </a-doption>
    </template>
  </a-dropdown>
</template>
