<script setup lang="ts">
import { ref } from 'vue'
import DriveScanTool from './DriveScanTool.vue'
import { itemKey, useDriveScan } from './useDriveScan'
import { deleteDriveDuplicates, scanDriveDuplicates, type DuplicateFileItem, type DuplicateGroup, type DuplicateScanMode } from '../../utils/drive-tools/duplicates'

const mode = ref<DuplicateScanMode>('helperName')
const numberText = ref('1,2,3')

const { driveOptions, selectedDriveKeys, loading, deleting, result, rows, selected, isSelected, toggleItem, toggleRow, handleScan, handleDelete } = useDriveScan<DuplicateGroup, DuplicateFileItem>({
  itemsOf: group => group.files,
  withItems: (group, files) => ({ ...group, files }),
  scan: async (targets, list) => {
    const data = await scanDriveDuplicates(targets, mode.value, { numbers: numberText.value })
    list.value = data.groups
    return data.report
  },
  remove: files => deleteDriveDuplicates(files),
  texts: {
    scanFailed: '扫描重复文件失败',
    scanEmpty: '未发现重复项',
    deleteNone: '请先勾选需要删除的文件',
    deleteConfirm: count => `准备删除 ${count} 个重复候选文件，是否继续？`,
    deletePartial: '部分文件删除失败，请查看报告',
    deleteDone: '重复文件删除操作完成',
    deleteFailed: '删除重复文件失败'
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
    hint="光鸭重复项规则：匹配文件名末尾的 (1)、(2)、(3)，支持中文括号、全角数字和扩展名。内容哈希模式按各网盘返回的 content_hash 判重。"
    empty-text="扫描结束，未发现重复项"
    @scan="handleScan">
    <template #options>
      <a-select v-model="mode" :disabled="loading" style="width: 150px">
        <a-option value="helperName">光鸭重复项</a-option>
        <a-option value="contentHash">内容哈希重复</a-option>
      </a-select>
      <a-input v-if="mode === 'helperName'" v-model="numberText" :disabled="loading" style="width: 120px" placeholder="编号，如 1,2,3" />
    </template>
    <template #actions>
      <a-button v-if="rows.length" status="danger" :disabled="!selected.size" :loading="deleting" @click="handleDelete">删除选中</a-button>
    </template>
    <template #row="{ row, index }">
      <div class="sameitem">
        <div class="samehash">
          <span>#{{ index + 1 }}：{{ row.label }}</span>
          <a-button type="text" size="mini" @click="toggleRow(row)">全选/取消</a-button>
        </div>
        <div v-for="file in row.files" :key="itemKey(file)" class="samefile">
          <a-checkbox :model-value="isSelected(file)" @change="toggleItem(file)" />
          <IconFont :name="file.icon" aria-hidden="true" />
          <div class="scan-row-name" :title="file.name">{{ file.name }}</div>
          <div class="scan-row-path" :title="file.path">{{ file.path }}</div>
          <div class="scan-row-meta">{{ file.sizeStr }} {{ file.timeStr }}</div>
        </div>
      </div>
    </template>
  </DriveScanTool>
</template>

<style>
.sameitem { padding: 10px 12px; border: 1px solid var(--color-border-1); }
.samehash { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; color: var(--color-text-3); font-size: 13px; }
.samefile { display: flex; align-items: center; gap: 8px; min-height: 32px; }
</style>
