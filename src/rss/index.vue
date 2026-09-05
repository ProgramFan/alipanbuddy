<script setup lang="ts">
import { useAppStore } from '../store'
import RssXiMa from './rssxima/RssXiMa.vue'
import RssJiaMi from './rssjiami/RssJiaMi.vue'
import RssEmptyDirs from './drivetools/RssEmptyDirs.vue'
import RssScanSame from './drivetools/RssScanSame.vue'
import RssScanClean from './drivetools/RssScanClean.vue'
import RssScanPunish from './rssscanpunish/RssScanPunish.vue'
import RssDriveCopy from './rssdrivecopy/RssDriveCopy.vue'
import { t } from '../i18n'

const appStore = useAppStore()
withDefaults(defineProps<{ sidebarVisible?: boolean }>(), { sidebarVisible: true })
</script>

<template>
  <a-layout style="height: 100%">
    <a-layout-sider v-show="sidebarVisible" hide-trigger :width="218" :resize-directions="['right']" class="xbyleft rss-sider single-boundary-sidebar">
      <div class="headdesc">{{ t('plugins.title') }}</div>
      <a-menu :style="{ width: '100%' }" class="xbyleftmenu rss-leftmenu single-boundary-sidebar-menu"
              :selected-keys="[appStore.GetAppTabMenu]"
              @update:selected-keys="appStore.toggleTabMenu('rss', $event[0])">
        <a-menu-item key="RssXiMa">
          <template #icon><IconFont name="iconcameraadd" /></template>
          {{ t('plugins.washCode') }}
        </a-menu-item>
        <a-menu-item key="RssJiaMi">
          <template #icon><IconFont name="iconsafebox" /></template>
          {{ t('plugins.encrypt') }}
        </a-menu-item>
        <a-menu-item key="RssEmptyDirs">
          <template #icon><IconFont name="iconempty" /></template>
          {{ t('plugins.emptyDirs') }}
        </a-menu-item>
        <a-menu-item key="RssScanSame">
          <template #icon><IconFont name="iconcopy" /></template>
          {{ t('plugins.scanDuplicates') }}
        </a-menu-item>
        <a-menu-item key="RssScanClean">
          <template #icon><IconFont name="iconclear" /></template>
          {{ t('plugins.largeFiles') }}
        </a-menu-item>
        <a-menu-item key="RssScanPunish">
          <template #icon><IconFont name="iconweixiang" /></template>
          {{ t('plugins.violations') }}
        </a-menu-item>
        <a-menu-item key="RssDriveCopy">
          <template #icon><IconFont name="iconchuanshu2" /></template>
          {{ t('plugins.albumCopy') }}
        </a-menu-item>
      </a-menu>
    </a-layout-sider>
    <a-layout-content class="rss-content-panel">
      <a-tabs type="text" :direction="'horizontal'" class="hidetabs" :justify="true" :active-key="appStore.GetAppTabMenu">
        <a-tab-pane key="RssXiMa" title="1"><RssXiMa /></a-tab-pane>
        <a-tab-pane key="RssJiaMi" title="2"><RssJiaMi /></a-tab-pane>
        <a-tab-pane key="RssEmptyDirs" title="3"><RssEmptyDirs /></a-tab-pane>
        <a-tab-pane key="RssScanSame" title="4"><RssScanSame /></a-tab-pane>
        <a-tab-pane key="RssScanClean" title="5"><RssScanClean /></a-tab-pane>
        <a-tab-pane key="RssScanPunish" title="6"><RssScanPunish /></a-tab-pane>
        <a-tab-pane key="RssDriveCopy" title="7"><RssDriveCopy /></a-tab-pane>
      </a-tabs>
    </a-layout-content>
  </a-layout>
</template>

<style>
.iconnode-tree1,
.iconshuzhuangtu {
  opacity: 0.8;
}

.rss-leftmenu .arco-menu-item {
  padding-right: 14px !important;
}

.rss-content-panel {
  min-width: 0;
  height: 100%;
  padding: 0;
  overflow: hidden;
  background: transparent !important;
}

.rss-content-panel .hidetabs {
  height: 100%;
}

.rss-content-panel .rightbg {
  height: 100%;
  margin: 0;
  overflow-y: auto !important;
  overflow-x: hidden !important;
}

/* Scan-style plugin pages (empty dirs, duplicates, large files, violations, album copy): the steps card keeps
   its own height, the tool card takes the rest of the pane and its list or tree scrolls inside it. */
.rss-content-panel .scanfill {
  display: flex;
  flex-direction: column;
}

.rss-content-panel .scanfix {
  flex: none;
}

.rss-content-panel .scanauto {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
}

/* .scan-body wraps a plain scrolling list; .scan-tree-box is the box an Arco virtual tree is measured against (useElementHeight) */
.rss-content-panel .scan-body,
.rss-content-panel .scan-tree-box {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  width: 100%;
  min-height: 160px;
  overflow: hidden;
}

.rss-content-panel .scan-list {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
}

.rss-content-panel .scan-list-item {
  flex: none;
}

.rss-content-panel .scan-empty {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.rss-content-panel .scan-split {
  flex: 1 1 0;
  width: 100%;
  min-height: 200px;
}

.rss-content-panel .scan-split > .arco-split-pane {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.rss-content-panel .scan-split .rsscopymenu {
  flex: none;
}
</style>
