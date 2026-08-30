<script setup lang='ts'>
import { computed, onMounted, ref } from 'vue'
import useSettingStore from './settingstore'
import MySwitch from '../layout/MySwitch.vue'
import { getAppNewPath, openExternal } from '../utils/electronhelper'
import { Code2 } from 'lucide-vue-next'
import { getPkgVersion } from '../utils/utils'
import { modalUpdateLog } from '../utils/modal'
import fs from 'node:fs'
import message from '../utils/message'
import { Sleep } from '../utils/format'
import { t } from '../i18n'

const platform = window.platform
const settingStore = useSettingStore()
const topTabOptions = [
  { key: 'pan', labelKey: 'nav.pan' }, { key: 'share', labelKey: 'nav.share' }, { key: 'rss', labelKey: 'nav.plugins' }
]

function toggleTopTab(key: string, hidden: boolean) {
  const tabs = new Set(settingStore.uiHiddenTopTabs || [])
  if (hidden) tabs.add(key)
  else tabs.delete(key)
  cb({ uiHiddenTopTabs: Array.from(tabs) })
}

const cb = (val: any) => {
  settingStore.updateStore(val)
}

const installedAppVersion = ref(getPkgVersion())

onMounted(() => {
  window.WebPlatformSync?.((data: { appVersion?: string }) => {
    if (typeof data?.appVersion === 'string' && data.appVersion) installedAppVersion.value = data.appVersion
  })
})
const getAppVersion = computed(() => installedAppVersion.value)

const verLoading = ref(false)
const handleCheckVer = async () => {
  verLoading.value = true
  try {
    const state = await window.AutoUpdateCheck?.(true)
    if (!state || state.status === 'unsupported') {
      message.info('后台更新仅支持已打包的桌面版本')
    } else if (state.status === 'downloading') {
      message.info(state.version ? `新版本 ${state.version} 正在后台下载` : '新版本正在后台下载')
    } else if (state.status === 'downloaded') {
      message.success(state.version ? `新版本 ${state.version} 已下载，退出 App 后即可更新` : '新版本已下载，退出 App 后即可更新')
    } else if (state.status === 'up-to-date') {
      message.info(`已经是最新版 ${getAppVersion.value}`, 6)
    } else if (state.status === 'error') {
      message.error('检查更新失败，请检查网络是否正常')
    } else {
      message.info('正在检查更新')
    }
  } finally {
    verLoading.value = false
  }
}
const handleUpdateLog = () => {
  modalUpdateLog()
}

function openSupport() {
  openExternal('https://xbyvideohub.com/support/')
}

const handleImportAsar = () => {
  window.WebShowOpenDialogSync({
    title: t('settings.selectAsar'),
    buttonLabel: t('settings.importUpdateFile'),
    filters: [{ name: 'app.asar', extensions: ['asar'] }],
    properties: ['openFile', 'showHiddenFiles', 'noResolveAliases', 'treatPackageAsDirectory', 'dontAddToRecent']
  }, async (files: string[] | undefined) => {
    if (files && files.length > 0) {
      // 导入到app.new
      await fs.promises.cp(files[0], getAppNewPath())
      message.info(t('settings.importUpdateSuccess'), 0)
      await Sleep(1000)
      window.WebToElectron({ cmd: 'relaunch' })
    }
  })
}
</script>

<template>
  <div class='settingcard'>
    <div class='settings-app-hero'>
      <div class='settings-app-badge'>{{ t('settings.application') }}</div>
      <div class='appver'>
        BoxPlayer {{ getAppVersion }}
        <span class="appver-badge">
          <Code2 :size="15" :stroke-width="2.2" />
          {{ t('settings.openSource') }}
        </span>
      </div>
    </div>
    <div class='settings-app-actions'>
      <a-button type='outline' status='success' size='small' @click='handleUpdateLog'>
        {{ t('settings.changelog') }}
      </a-button>
      <a-button type='outline' status='warning' size='small' @click='openSupport'>
        {{ t('settings.submitFeedback') }}
      </a-button>
      <a-button type='outline' size='small' :loading='verLoading' @click='handleCheckVer'>
        {{ t('settings.checkUpdates') }}
      </a-button>
      <a-button v-if='platform !== "linux"' status='warning' type='outline' size='small' @click='handleImportAsar'>
        {{ t('settings.import') }}
      </a-button>
    </div>
    <div class='settingspace'></div>
    <div class='settinghead'>{{ t('settings.language') }}</div>
    <div class='settingrow'>
      <a-radio-group type='button' tabindex='-1' :model-value='settingStore.uiLanguage' @update:model-value='cb({ uiLanguage: $event })'>
        <a-radio tabindex='-1' value='zh-CN'>{{ t('settings.chinese') }}</a-radio>
        <a-radio tabindex='-1' value='en-US'>{{ t('settings.english') }}</a-radio>
      </a-radio-group>
    </div>
    <div class='settingspace'></div>
    <div class='settinghead'>{{ t('settings.appearance') }}</div>
    <div class='settingrow'>
      <a-radio-group type='button' tabindex='-1' :model-value='settingStore.uiTheme'
                     @update:model-value='cb({ uiTheme: $event })'>
        <a-radio tabindex='-1' value='system'>{{ t('common.system') }}</a-radio>
        <a-radio tabindex='-1' value='light'>{{ t('common.light') }}</a-radio>
        <a-radio tabindex='-1' value='dark'>{{ t('common.dark') }}</a-radio>
      </a-radio-group>
    </div>
    <div class='settingspace'></div>
    <div class='settinghead'>{{ t('settings.hideTabs') }}</div>
    <div class='settingrow'>
      <a-checkbox v-for='tab in topTabOptions' :key='tab.key' :checked='settingStore.uiHiddenTopTabs.includes(tab.key)' @update:model-value='(hidden: boolean) => toggleTopTab(tab.key, hidden)'>{{ t(tab.labelKey as Parameters<typeof t>[0]) }}</a-checkbox>
    </div>
    <div class='settingspace'></div>
    <div class='settinghead'>{{ t('settings.defaultTab') }}</div>
    <div class='settingrow'>
      <a-radio-group
        type='button'
        tabindex='-1'
        :model-value='settingStore.uiDefaultTab'
        @update:model-value='cb({ uiDefaultTab: $event })'
      >
        <a-radio tabindex='-1' value='pan'>{{ t('nav.pan') }}</a-radio>
        <a-radio tabindex='-1' value='share'>{{ t('nav.share') }}</a-radio>
        <a-radio tabindex='-1' value='rss'>{{ t('nav.plugins') }}</a-radio>
      </a-radio-group>
    </div>
    <template v-if="['win32', 'darwin'].includes(platform)">
      <div class='settingspace'></div>
      <div class='settinghead'>{{ t('settings.startup') }}</div>
      <div class='settingrow'>
        <MySwitch :value='settingStore.uiLaunchStart' @update:value='cb({ uiLaunchStart: $event })'>
          {{ t('settings.startAtLogin') }}
        </MySwitch>
      </div>
      <div class='settingrow' v-if="settingStore.uiLaunchStart">
        <MySwitch :value='settingStore.uiLaunchStartShow'
                  @update:value='cb({ uiLaunchStartShow: $event })'>
          {{ t('settings.showOnStart') }}
        </MySwitch>
      </div>
      <div class='settingrow'>
        <MySwitch :value='settingStore.uiLaunchMaximized' @update:value='cb({ uiLaunchMaximized: $event })'>
          {{ t('book.autoMaximizeMainWindow') }}
        </MySwitch>
      </div>
    </template>
    <div class='settingspace'></div>
    <div class='settinghead'>{{ t('settings.update') }}</div>
    <div class='settingrow'>
      <MySwitch :value='settingStore.uiLaunchAutoCheckUpdate'
                @update:value='cb({ uiLaunchAutoCheckUpdate: $event })'>
        {{ t('settings.checkOnStart') }}
      </MySwitch>
    </div>
    <div class='settingspace'></div>
    <div class='settinghead'>{{ t('settings.autoSign') }}</div>
    <div class='settingrow'>
      <MySwitch :value='settingStore.uiLaunchAutoSign' @update:value='cb({ uiLaunchAutoSign: $event })'>
        {{ t('settings.signOnStart') }}
      </MySwitch>
    </div>
    <div class='settingspace'></div>
    <div class='settinghead'>{{ t('settings.exit') }}</div>
    <div class='settingrow'>
      <MySwitch :value='settingStore.uiExitOnClose' @update:value='cb({ uiExitOnClose: $event })'>
        {{ t('settings.exitOnClose') }}
      </MySwitch>
      <a-popover position='right'>
        <IconFont name="iconbulb" />
        <template #content>
          <div>
            {{ t('settings.defaultOff') }}
            <hr />
            {{ t('settings.exitHelp') }}
          </div>
        </template>
      </a-popover>
    </div>
    <div class='settingspace'></div>
    <div class='settinghead'>{{ t('settings.updateProxy') }}</div>
    <div class='settingrow'>
      <MySwitch :value='settingStore.uiUpdateProxyEnable' @update:value='cb({ uiUpdateProxyEnable: $event })'>
        {{ t('settings.enableUpdateProxy') }}
      </MySwitch>
      <div class='settingrow' v-if="settingStore.uiUpdateProxyEnable">
        <a-input v-model.trim='settingStore.uiUpdateProxyUrl'
                 allow-clear
                 :style="{ width: '280px' }"
                 :placeholder="t('settings.updateProxy')"
                 @update:model-value='cb({ uiUpdateProxyUrl: $event })' />
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-app-hero {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
}

.settings-app-badge {
  display: inline-flex;
  align-self: flex-start;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(88, 130, 255, 0.12);
  color: var(--color-primary-6);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.appver {
  font-weight: 600;
  font-size: 28px;
  line-height: 1.4;
}

.settings-app-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.settings-app-actions :deep(.arco-btn) {
  margin-left: 0 !important;
}

:global(html.dark) .settings-app-badge {
  background: rgba(120, 160, 255, 0.2);
  color: #dbe6ff;
}

@media (max-width: 900px) {
  .appver {
    font-size: 24px;
  }
}

.appver-badge{display:inline-flex;align-items:center;gap:6px;margin-left:10px;padding:5px 11px;font-size:12px;font-weight:800;line-height:1;letter-spacing:.05em;color:var(--color-text-1);background:var(--color-fill-3);border:1px solid var(--color-border-2);border-radius:6px;vertical-align:middle;box-shadow:0 1px 3px rgba(15,23,42,.12)}
:global(html.dark) .appver-badge{color:#e5e7eb;background:rgba(148,163,184,.16);border-color:rgba(148,163,184,.38)}
:global(html.dark) 
.spin{animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
