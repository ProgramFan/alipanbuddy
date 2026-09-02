<script setup lang="ts">
import { useAppStore } from '../store'
import Downing from '../download/Downing.vue'
import Downed from '../download/Downed.vue'
import Uploading from '../upload/Uploading.vue'
import Uploaded from '../upload/Uploaded.vue'
import { t } from '../i18n'

const appStore = useAppStore()
withDefaults(defineProps<{ sidebarVisible?: boolean }>(), { sidebarVisible: true })
</script>

<template>
  <a-layout style="height: 100%">
    <a-layout-sider v-show="sidebarVisible" hide-trigger :width="218" :resize-directions="['right']" class="xbyleft single-boundary-sidebar">
      <div class="headdesc">{{ t('transfer.title') }}</div>
      <a-menu :style="{ width: '100%' }" class="xbyleftmenu single-boundary-sidebar-menu" :selected-keys="[appStore.GetAppTabMenu]" @update:selected-keys="appStore.toggleTabMenu('down', $event[0])">
        <a-menu-item key="DowningRight">
          <template #icon><IconFont name="icondownload" /></template>
          {{ t('transfer.downloading') }}
        </a-menu-item>
        <a-menu-item key="DownedRight">
          <template #icon><IconFont name="icondesktop" /></template>
          {{ t('transfer.downloaded') }}
        </a-menu-item>
        <a-menu-item key="UploadingRight">
          <template #icon><IconFont name="iconcloud-upload" /></template>
          {{ t('transfer.uploading') }}
        </a-menu-item>
        <a-menu-item key="UploadedRight">
          <template #icon><IconFont name="iconcloud_success" /></template>
          {{ t('transfer.uploaded') }}
        </a-menu-item>
      </a-menu>
    </a-layout-sider>
    <a-layout-content class="xbyright">
      <a-tabs type="text" :direction="'horizontal'" class="hidetabs" :justify="true" :active-key="appStore.GetAppTabMenu">
        <a-tab-pane key="DowningRight" title="1"><Downing /></a-tab-pane>
        <a-tab-pane key="DownedRight" title="2"><Downed /></a-tab-pane>
        <a-tab-pane key="UploadingRight" title="3"><Uploading /></a-tab-pane>
        <a-tab-pane key="UploadedRight" title="4"><Uploaded /></a-tab-pane>
      </a-tabs>
    </a-layout-content>
  </a-layout>
</template>

<style></style>
