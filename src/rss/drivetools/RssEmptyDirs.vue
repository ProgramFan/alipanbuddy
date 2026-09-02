<script setup lang="ts">
import DriveScanTool from './DriveScanTool.vue'
import { useDriveScan } from './useDriveScan'
import { deleteDriveEmptyDirs, scanDriveEmptyDirs, type EmptyDirItem } from '../../utils/drive-tools/emptyDirs'

const { driveOptions, selectedDriveKeys, loading, deleting, result, rows, selected, isSelected, toggleItem, toggleAll, handleScan, handleDelete } = useDriveScan<EmptyDirItem, EmptyDirItem>({
  itemsOf: dir => [dir],
  scan: async (targets, list) => {
    const reports: string[] = []
    for (const target of targets) {
      const data = await scanDriveEmptyDirs(target.userId, target.driveId, target.rootId)
      reports.push(`${target.name}：${data.report}`)
      list.value.push(...data.emptyDirs)
    }
    return reports.join('\n')
  },
  remove: dirs => deleteDriveEmptyDirs(dirs),
  texts: {
    scanFailed: '扫描空目录失败',
    scanEmpty: '未发现空目录',
    scanFound: count => `发现 ${count} 个空目录`,
    deleteNone: '请先勾选需要删除的空目录',
    deleteConfirm: count => `准备删除 ${count} 个空目录，是否继续？`,
    deletePartial: '部分空目录删除失败，请查看报告',
    deleteDone: '空目录删除操作完成',
    deleteFailed: '删除空目录失败'
  }
})
</script>

<template>
  <DriveScanTool
    v-model:selected-keys="selectedDriveKeys"
    :drive-options="driveOptions"
    :loading="loading"
    :report="result"
    :rows="rows"
    scanning-text="正在扫描目录树"
    pick-text="勾选需要删除的空目录"
    hint="扫描每个网盘根目录下最里层且完全空的目录。删除会按对应网盘能力执行，部分网盘可能不支持回收站。"
    empty-text="扫描结束，未发现空目录"
    @scan="handleScan">
    <template #actions>
      <a-button v-if="rows.length" @click="toggleAll">全选/取消</a-button>
      <a-button v-if="rows.length" status="danger" :disabled="!selected.size" :loading="deleting" @click="handleDelete">删除选中</a-button>
    </template>
    <template #row="{ row }">
      <div class="scan-row">
        <a-checkbox :model-value="isSelected(row)" @change="toggleItem(row)" />
        <IconFont name="iconfile-folder" aria-hidden="true" />
        <div class="scan-row-name" :title="row.name">{{ row.name }}</div>
        <div class="scan-row-path" :title="row.path">{{ row.path }}</div>
      </div>
    </template>
  </DriveScanTool>
</template>
