<script setup lang="ts" generic="Row">
import { computed } from 'vue'
import { driveKey, type DriveScanTarget } from './useDriveScan'

const props = defineProps<{
  driveOptions: DriveScanTarget[]
  selectedKeys: string[]
  loading: boolean
  report: string
  rows: Row[]
  scanningText: string
  pickText: string
  hint: string
  emptyText: string
}>()

const emit = defineEmits<{
  (e: 'update:selectedKeys', keys: string[]): void
  (e: 'scan'): void
}>()

defineSlots<{
  options?(): any
  actions?(): any
  row?(props: { row: Row; index: number }): any
}>()

const scanDescription = computed(() => (props.loading ? props.scanningText : props.report || '选择网盘后开始扫描'))
</script>

<template>
  <div class="scanfill rightbg">
    <div class="settingcard scanfix" style="padding: 12px 24px 8px 24px">
      <a-steps>
        <a-step :description="scanDescription">扫描</a-step>
        <a-step :description="pickText">勾选</a-step>
        <a-step description="按网盘能力执行删除">删除</a-step>
      </a-steps>
    </div>

    <div class="settingcard scanauto" style="padding: 12px; margin-top: 4px">
      <div class="scan-toolbar">
        <a-select :model-value="selectedKeys" multiple allow-clear placeholder="选择网盘" :disabled="loading" style="min-width: 260px; flex: 1" @update:model-value="emit('update:selectedKeys', $event as string[])">
          <a-option v-for="target in driveOptions" :key="driveKey(target)" :value="driveKey(target)">{{ target.name }}</a-option>
        </a-select>
        <slot name="options" />
        <a-button type="primary" :loading="loading" @click="emit('scan')">开始扫描</a-button>
        <slot name="actions" />
      </div>
      <div class="scan-hint">{{ hint }}</div>
      <pre v-if="report" class="scan-report">{{ report }}</pre>
      <a-spin class="scan-body" :loading="loading">
        <div class="scan-list">
          <div v-if="!rows.length" class="scan-empty"><a-empty :description="emptyText" /></div>
          <div v-for="(row, index) in rows" :key="index" class="scan-list-item"><slot name="row" :row="row" :index="index" /></div>
        </div>
      </a-spin>
    </div>
  </div>
</template>

<style>
.scan-toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.scan-hint { margin: 10px 0; color: var(--color-text-3); font-size: 12px; line-height: 1.6; }
.scan-report { margin: 0 0 8px; white-space: pre-wrap; word-break: break-word; color: var(--color-text-2); font-size: 12px; }
.scan-row { display: flex; align-items: center; gap: 8px; min-height: 36px; padding: 0 8px; border-bottom: 1px solid var(--color-border-1); }
.scan-row-name { width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scan-row-path { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-text-4); font-size: 12px; }
.scan-row-meta { color: var(--color-text-4); font-size: 12px; white-space: nowrap; }
</style>
