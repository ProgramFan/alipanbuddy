<script setup lang="ts">
import { ref } from 'vue'
import DriveScanTool from './DriveScanTool.vue'
import { useDriveScan } from './useDriveScan'
import { deleteDriveLargeFiles, scanDriveLargeFiles, type LargeFileItem, type LargeFileScanMode } from '../../utils/drive-tools/largeFiles'

const mode = ref<LargeFileScanMode>('size')
const fileSize = ref(100)

const { driveOptions, selectedDriveKeys, loading, deleting, result, rows, selected, isSelected, toggleItem, toggleAll, handleScan, handleDelete } = useDriveScan<LargeFileItem, LargeFileItem>({
  itemsOf: file => [file],
  scan: async (targets, list) => {
    const data = await scanDriveLargeFiles(targets, mode.value, { customSizeMB: fileSize.value })
    list.value = data.files
    return data.report
  },
  remove: files => deleteDriveLargeFiles(files),
  texts: {
    scanFailed: '扫描大文件失败',
    scanEmpty: '未发现大文件',
    deleteNone: '请先勾选需要删除的文件',
    deleteConfirm: count => `准备删除 ${count} 个文件，是否继续？`,
    deletePartial: '部分文件删除失败，请查看报告',
    deleteDone: '大文件删除操作完成',
    deleteFailed: '删除大文件失败'
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
    scanning-text="正在扫描目录和文件"
    pick-text="勾选需要删除的文件"
    hint="按当前阈值递归扫描所选网盘。不同网盘返回的分类信息可能不同，文档/压缩包模式会同时参考文件扩展名。"
    empty-text="扫描结束，未发现大文件"
    @scan="handleScan">
    <template #options>
      <a-select v-model="mode" :disabled="loading" style="width: 150px">
        <a-option value="size">自定义</a-option>
        <a-option value="video">视频&gt;1G</a-option>
        <a-option value="doc">文档&gt;1G</a-option>
        <a-option value="zip">压缩包&gt;1G</a-option>
        <a-option value="others">其他&gt;1G</a-option>
        <a-option value="size5000">全部&gt;5G</a-option>
        <a-option value="size1000">全部&gt;1G</a-option>
        <a-option value="size100">全部&gt;100MB</a-option>
      </a-select>
      <a-input-number v-if="mode === 'size'" v-model="fileSize" :disabled="loading" style="width: 150px" :min="1" :max="100000" :step="100">
        <template #prefix>大于</template>
        <template #suffix>MB</template>
      </a-input-number>
    </template>
    <template #actions>
      <a-button v-if="rows.length" @click="toggleAll">全选/取消</a-button>
      <a-button v-if="rows.length" status="danger" :disabled="!selected.size" :loading="deleting" @click="handleDelete">删除选中</a-button>
    </template>
    <template #row="{ row }">
      <div class="scan-row">
        <a-checkbox :model-value="isSelected(row)" @change="toggleItem(row)" />
        <IconFont :name="row.icon" aria-hidden="true" />
        <div class="scan-row-name" :title="row.name">{{ row.name }}</div>
        <div class="scan-row-path" :title="row.path">{{ row.path }}</div>
        <div class="scan-row-meta">{{ row.sizeStr }}</div>
      </div>
    </template>
  </DriveScanTool>
</template>
