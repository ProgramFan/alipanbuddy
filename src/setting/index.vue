<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useAppStore } from '../store'
import SettingPan from './SettingPan.vue'
import SettingUI from './SettingUI.vue'
import SettingAccount from './SettingAccount.vue'
import SettingDown from './SettingDown.vue'
import SettingDebug from './SettingDebug.vue'
import SettingUpload from './SettingUpload.vue'
import SettingAria from './SettingAria.vue'
import SettingLog from './SettingLog.vue'
import SettingProxy from './SettingProxy.vue'
import SettingSecurity from './SettingSecurity.vue'
import SettingDownloadAdvanced from './SettingDownloadAdvanced.vue'
import { t } from '../i18n'

const appStore = useAppStore()
withDefaults(defineProps<{ sidebarVisible?: boolean }>(), { sidebarVisible: true })

let observer: any

const hideSetting = computed(() => appStore.appTab !== 'setting')
const settingSearch = ref('')
const settingSearchResults = ref<Array<{ label: string; element: HTMLElement }>>([])
const settingSearchAnchor = ref<HTMLElement>()
const settingSearchPopupStyle = ref<Record<string, string>>({})

const matchesSettingSearch = (text: string, query: string) => {
  const source = text.toLocaleLowerCase()
  const keyword = query.toLocaleLowerCase().replace(/\s+/g, '')
  if (!keyword) return true
  if (source.includes(keyword)) return true
  let position = 0
  return [...keyword].every((character) => {
    position = source.indexOf(character, position)
    if (position < 0) return false
    position += character.length
    return true
  })
}

const refreshSettingSearch = async () => {
  await nextTick()
  const query = settingSearch.value.trim()
  if (!query) {
    settingSearchResults.value = []
    return
  }
  const rows = Array.from(document.querySelectorAll<HTMLElement>('#SettingObserver .settingrow'))
  settingSearchResults.value = rows
    .filter((row) => matchesSettingSearch(row.innerText.replace(/\s+/g, ' '), query))
    .slice(0, 20)
    .map((element) => ({ label: element.innerText.replace(/\s+/g, ' ').trim(), element }))
  updateSettingSearchPopupPosition()
}

const updateSettingSearchPopupPosition = () => {
  const rect = settingSearchAnchor.value?.getBoundingClientRect()
  if (!rect) return
  settingSearchPopupStyle.value = {
    left: `${Math.round(rect.left)}px`,
    top: `${Math.round(rect.bottom + 8)}px`,
    width: `${Math.max(300, Math.round(rect.width))}px`
  }
}

const locateSettingSearchResult = (result: { element: HTMLElement }) => {
  result.element.scrollIntoView({ behavior: 'smooth', block: 'center' })
  result.element.classList.remove('settings-search-hit')
  window.requestAnimationFrame(() => result.element.classList.add('settings-search-hit'))
  window.setTimeout(() => result.element.classList.remove('settings-search-hit'), 1400)
}

const sectionMeta: Record<string, { title: string }> = {
  SettingUI: { title: 'settings.app' },
  SettingAccount: { title: 'settings.account' },
  SettingSecurity: { title: 'settings.security' },
  SettingPan: { title: 'settings.pan' },
  SettingDown: { title: 'settings.download' },
  SettingDownloadAdvanced: { title: 'settings.downloadAdvanced' },
  SettingUpload: { title: 'settings.upload' },
  SettingDebug: { title: 'settings.advanced' },
  SettingProxy: { title: 'settings.proxy' },
  SettingAria: { title: 'settings.remoteAria' },
  SettingLog: { title: 'settings.logs' }
}

onMounted(() => {
  window.addEventListener('resize', updateSettingSearchPopupPosition)
  const root = document.getElementById('SettingObserver')
  if (!root) return

  observer = new IntersectionObserver(
    (entries) => {
      if (entries.length > 0 && entries[0].isIntersecting) {
        appStore.toggleTabSetting('setting', entries[0].target.id)
      }
    },
    {
      root,
      threshold: 0.5
    }
  )

  const sectionIds = [
    'SettingUI',
    'SettingAccount',
    'SettingSecurity',
    'SettingPan',
    'SettingDown',
    'SettingDownloadAdvanced',
    'SettingUpload',
    'SettingDebug',
    'SettingProxy',
    'SettingAria',
    'SettingLog'
  ]

  sectionIds.forEach((id) => {
    const element = document.getElementById(id)
    if (element instanceof Element) {
      observer.observe(element)
    }
  })
})

onUnmounted(() => {
  if (observer) observer.disconnect()
  window.removeEventListener('resize', updateSettingSearchPopupPosition)
})
</script>

<template>
  <a-layout class="settings-shell">
    <a-layout-sider v-show="sidebarVisible" hide-trigger :width="188" class="xbyleft settings-sider single-boundary-sidebar" tabindex="-1" @keydown.tab.prevent="() => true">
      <div class='headdesc settings-side-title'>
        <span class="settings-side-kicker">{{ t('settings.preferences') }}</span>
        <strong>{{ t('settings.center') }}</strong>
      </div>
      <div ref="settingSearchAnchor" class="settings-search">
        <a-input-search v-model="settingSearch" allow-clear :placeholder="t('settings.searchPlaceholder')" @input="refreshSettingSearch" @clear="refreshSettingSearch" />
      </div>
      <a-menu :selected-keys="[appStore.GetAppTabMenu]" :style="{ width: '100%' }" class="xbyleftmenu single-boundary-sidebar-menu"
              @update:selected-keys="appStore.toggleTabMenu('setting', $event[0])">
        <div class="settings-menu-group">{{ t('settings.group.general') }}</div>
        <a-menu-item key="SettingUI">
          <template #icon><IconFont name="iconui" /></template>
          {{ t('settings.app') }}
        </a-menu-item>
        <a-menu-item key="SettingAccount">
          <template #icon><IconFont name="iconrobot" /></template>
          {{ t('settings.account') }}
        </a-menu-item>
        <a-menu-item key="SettingSecurity">
          <template #icon><IconFont name="iconchrome" /></template>
          {{ t('settings.security') }}
        </a-menu-item>
        <div class="settings-menu-group">{{ t('settings.group.playback') }}</div>
        <div class="settings-menu-group">{{ t('settings.group.driveTransfer') }}</div>
        <a-menu-item key="SettingPan">
          <template #icon><IconFont name="iconfile-folder" /></template>
          {{ t('settings.pan') }}
        </a-menu-item>
        <a-menu-item key="SettingDown">
          <template #icon><IconFont name="icondownload" /></template>
          {{ t('settings.download') }}
        </a-menu-item>
        <a-menu-item key="SettingDownloadAdvanced">
          <template #icon><IconFont name="iconcloud-download" /></template>
          {{ t('settings.downloadAdvanced') }}
        </a-menu-item>
        <a-menu-item key="SettingUpload">
          <template #icon><IconFont name="iconupload" /></template>
          {{ t('settings.upload') }}
        </a-menu-item>
        <div class="settings-menu-group">{{ t('settings.group.system') }}</div>
        <a-menu-item key="SettingDebug">
          <template #icon><IconFont name="iconlogoff" /></template>
          {{ t('settings.advanced') }}
        </a-menu-item>
        <a-menu-item key="SettingProxy">
          <template #icon><IconFont name="iconyuanduanfuzhi" /></template>
          {{ t('settings.proxy') }}
        </a-menu-item>
        <a-menu-item key="SettingAria">
          <template #icon><IconFont name="iconchuanshu" /></template>
          {{ t('settings.remoteAria') }}
        </a-menu-item>
        <a-menu-item key="SettingLog">
          <template #icon><IconFont name="icondebug" /></template>
          {{ t('settings.logs') }}
        </a-menu-item>
      </a-menu>
    </a-layout-sider>
    <Teleport to="body">
      <div v-if="settingSearch.trim()" class="settings-search-results settings-search-results-popup" :style="settingSearchPopupStyle">
        <button v-for="result in settingSearchResults" :key="result.label" type="button" @click="locateSettingSearchResult(result)">{{ result.label }}</button>
        <span v-if="!settingSearchResults.length">{{ t('settings.searchNoResults') }}</span>
      </div>
    </Teleport>
    <a-layout-content id="SettingObserver" class="xbyright fullscroll settings-content" tabindex="-1" @keydown.tab.prevent="() => true">
      <div id="SettingDiv" class="settings-content-inner">
<!--        <div class="settings-hero">-->
<!--          <div>-->
<!--            <div class="settings-hero-kicker">AlipanBuddy Workspace</div>-->
<!--            <h2>按照你的使用方式定制整个 App</h2>-->
<!--            <p>从界面风格到播放方式、从网盘策略到安全控制，所有配置集中在这里完成。</p>-->
<!--          </div>-->
<!--          <div class="settings-hero-meta">-->
<!--            <span>12 个模块</span>-->
<!--            <span>即时生效</span>-->
<!--          </div>-->
<!--        </div>-->

        <section id="SettingUI" class="settings-section"><div class="settings-section-header"><h2>{{ t(sectionMeta.SettingUI.title as Parameters<typeof t>[0]) }}</h2></div><SettingUI /></section>
        <section id="SettingAccount" class="settings-section"><div class="settings-section-header"><h2>{{ t(sectionMeta.SettingAccount.title as Parameters<typeof t>[0]) }}</h2></div><SettingAccount /></section>
        <section id="SettingSecurity" class="settings-section"><div class="settings-section-header"><h2>{{ t(sectionMeta.SettingSecurity.title as Parameters<typeof t>[0]) }}</h2></div><SettingSecurity /></section>
        <section id="SettingPan" class="settings-section"><div class="settings-section-header"><h2>{{ t(sectionMeta.SettingPan.title as Parameters<typeof t>[0]) }}</h2></div><SettingPan /></section>
        <section id="SettingDown" class="settings-section"><div class="settings-section-header"><h2>{{ t(sectionMeta.SettingDown.title as Parameters<typeof t>[0]) }}</h2></div><SettingDown /></section>
        <section id="SettingDownloadAdvanced" class="settings-section"><div class="settings-section-header"><h2>{{ t(sectionMeta.SettingDownloadAdvanced.title as Parameters<typeof t>[0]) }}</h2></div><SettingDownloadAdvanced /></section>
        <section id="SettingUpload" class="settings-section"><div class="settings-section-header"><h2>{{ t(sectionMeta.SettingUpload.title as Parameters<typeof t>[0]) }}</h2></div><SettingUpload /></section>
        <section id="SettingDebug" class="settings-section"><div class="settings-section-header"><h2>{{ t(sectionMeta.SettingDebug.title as Parameters<typeof t>[0]) }}</h2></div><SettingDebug /></section>
        <section id="SettingProxy" class="settings-section"><div class="settings-section-header"><h2>{{ t(sectionMeta.SettingProxy.title as Parameters<typeof t>[0]) }}</h2></div><SettingProxy /></section>
        <section id="SettingAria" class="settings-section"><div class="settings-section-header"><h2>{{ t(sectionMeta.SettingAria.title as Parameters<typeof t>[0]) }}</h2></div><SettingAria /></section>
        <section id="SettingLog" class="settings-section">
          <div class="settings-section-header"><h2>{{ t(sectionMeta.SettingLog.title as Parameters<typeof t>[0]) }}</h2></div>
          <div v-if="hideSetting" style="min-height: 602px"></div>
          <SettingLog v-else />
        </section>
        <div style="height: 28px"></div>
      </div>
    </a-layout-content>
  </a-layout>
</template>

<style>
.settings-shell {
  height: 100%;
  background: transparent;
}

#SettingObserver {
  background: transparent;
  padding: 0 26px 0 18px !important;
}

.settings-sider {
  padding: 16px 12px;
}

.settings-side-title {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 4px;
  height: auto;
  margin: 2px 6px 14px;
  padding: 8px 10px;
  line-height: normal;
  white-space: normal;
  overflow: visible;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.settings-side-kicker {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--md-on-surface-variant);
}

.settings-side-title strong {
  font-size: 20px;
  font-weight: 600;
  line-height: 1.15;
  color: var(--md-on-surface);
  white-space: nowrap;
}

.settings-content {
  padding-block: 18px 28px !important;
}

.settings-content-inner {
  position: relative;
  width: min(1180px, 100%);
  margin: 0 auto;
}

.settings-search {
  position: relative;
  z-index: 3;
  margin: 0 6px 14px;
}

.settings-search .arco-input-wrapper {
  min-height: 36px;
  padding-inline: 10px;
  border: 1px solid var(--md-outline-variant);
  border-radius: var(--md-shape-sm);
  background: var(--md-surface);
  box-shadow: none;
}

.settings-search .arco-input {
  color: var(--md-on-surface);
  font-size: 12px;
}

.settings-search .arco-input::placeholder {
  color: var(--md-on-surface-variant);
  opacity: 1;
}

.settings-search-results {
  display: grid;
  gap: 4px;
  max-height: 200px;
  margin-top: 8px;
  padding: 6px;
  overflow: auto;
  border: 1px solid var(--md-outline-variant);
  border-radius: var(--md-shape-md);
  background: var(--md-surface-container-high);
  box-shadow: var(--md-elevation-2);
}

.settings-search-results-popup {
  position: fixed;
  z-index: 1001;
  max-width: calc(100vw - 16px);
  max-height: min(360px, calc(100vh - 24px));
}

.settings-search-results button,
.settings-search-results span {
  overflow: hidden;
  padding: 8px 10px;
  color: var(--md-on-surface-variant);
  font-size: 13px;
  line-height: 1.4;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 0;
  border-radius: var(--md-shape-sm);
  background: transparent;
}

.settings-search-results button { cursor: pointer; }
.settings-search-results button:hover { color: var(--md-primary-text); background: var(--md-state-selected); }
.settings-search-hit { animation: settings-search-hit 1.4s ease-out; }

@keyframes settings-search-hit {
  0%, 45% { background: rgba(var(--primary-6), 0.20); }
  100% { background: transparent; }
}

.settings-section {
  position: relative;
  margin: 22px 0;
  padding: 20px 24px 22px;
  border: 1px solid var(--md-outline-variant);
  border-radius: var(--md-shape-md);
  background: var(--md-surface);
  box-shadow: none;
}

.settings-section-header {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 16px;
  padding: 0 0 12px;
  border-bottom: 1px solid var(--md-outline-variant);
  text-align: left;
}

.settings-section-header h2 {
  margin: 0;
  color: var(--md-on-surface);
  font-size: 18px;
  line-height: 1.2;
  font-weight: 600;
  letter-spacing: 0;
}

.settingcard {
  padding: 18px 0;
  margin: 0;
  border-radius: var(--md-shape-md);
  user-select: none;
  -webkit-user-drag: none;
}

#xbybody #SettingObserver .settingcard {
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}

.settingcard .iconbulb,
.settingrow .iconbulb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 20px;
  width: 20px;
  margin-left: 6px;
  border-radius: var(--md-shape-full);
  color: #b7791f;
  font-size: 13px;
  background: rgba(255, 196, 82, 0.18);
  cursor: help;
  flex-shrink: 0;
}

body[arco-theme='dark'] .settingcard .iconbulb,
body[arco-theme='dark'] .settingrow .iconbulb {
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.14);
}

.settinghead {
  position: relative;
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 10px;
  width: 100%;
  margin-bottom: 10px;
  padding: 0;
  color: var(--md-on-surface);
  font-size: 15px;
  line-height: 1.4;
  font-weight: 600;
  user-select: none;
  word-break: keep-all;
}

.settingrow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding-top: 4px;
  max-width: 760px;
  margin-right: auto;
  color: var(--md-on-surface-variant);
  line-height: 1.75;
}

.settingspace {
  height: 22px;
  user-select: none;
}

.hrspace {
  padding-top: 8px;
}

.arco-popover-content hr {
  opacity: 0.2;
  border-top: none;
}

.settings-sider .xbyleftmenu {
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent !important;
  box-shadow: none !important;
}

.settings-sider .xbyleftmenu .arco-menu-inner {
  padding: 0 !important;
}

.settings-menu-group {
  margin: 16px 12px 8px;
  padding-top: 12px;
  border-top: 1px solid var(--md-outline-variant);
  color: var(--md-on-surface-variant);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  line-height: 1;
  text-transform: uppercase;
}

.settings-menu-group:first-child {
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
}

.settings-sider .xbyleftmenu .arco-menu-icon {
  font-size: 17px;
  margin-right: 10px !important;
  opacity: 0.92;
}

.settingcard .arco-input-wrapper,
.settingcard .arco-input,
.settingcard .arco-select-view,
.settingcard .arco-textarea-wrapper,
.settingcard .arco-input-number,
.settingcard .arco-picker,
.settingcard .arco-picker-size-medium,
.settingcard .arco-input-group-wrapper,
.settingcard .arco-input-search {
  border-radius: var(--md-shape-sm) !important;
}

.settingcard .arco-btn {
  border-radius: var(--md-shape-sm);
  font-weight: 500;
}

.settingcard .arco-radio-group-button .arco-radio-button {
  border-radius: var(--md-shape-sm);
  margin-right: 8px;
  border-color: var(--md-outline-variant);
  background: transparent;
}

.settingcard .arco-radio-group-button .arco-radio-button:hover {
  border-color: rgba(var(--primary-6), 0.45);
}

.settingcard .arco-radio-group-button .arco-radio-button.arco-radio-checked {
  background: rgb(var(--primary-6));
  border-color: rgb(var(--primary-6));
}

.settingcard .arco-radio-group-button .arco-radio-button-content {
  font-weight: 500;
  color: var(--color-text-2);
}

.settingcard .arco-radio-group-button .arco-radio-checked .arco-radio-button-content {
  color: #fff;
}

.settingcard .arco-switch {
  transform: translateY(1px);
}

.settingcard .arco-divider-text {
  padding: 0 10px;
  color: var(--md-on-surface);
  font-size: 14px;
  font-weight: 600;
  background: transparent;
}

.settingcard .arco-divider-line {
  border-color: var(--md-outline-variant);
}

@media (max-width: 1080px) {
  #SettingObserver {
    padding: 0 16px !important;
  }

  .settingrow {
    max-width: 100%;
  }
}
</style>
