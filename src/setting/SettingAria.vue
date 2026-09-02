<script setup lang="ts">
import { ref } from 'vue'
import useSettingStore from './settingstore'
import { AriaChangeToLocal, AriaChangeToRemote, AriaTest, AriaApplyAdvancedOptions } from '../download/aria2c'
import { fetchTrackerSource, normalizeTrackerText } from '../download/integration/tracker'
import message from '../utils/message'
import { t } from '../i18n'

const settingStore = useSettingStore()
const cb = (val: any) => {
  settingStore.updateStore(val)
}
const ariaSavePath = ref(settingStore.ariaSavePath)
const ariaUrl = ref(settingStore.ariaUrl)
const ariaPwd = ref(settingStore.ariaPwd)
const trackerSyncing = ref(false)

const applyAriaOptions = () => AriaApplyAdvancedOptions().catch(() => {})

const handleAriaConn = () => {
  ariaSavePath.value = ariaSavePath.value.trim()
  if (!ariaSavePath.value || (ariaSavePath.value.indexOf('/') < 0 && ariaSavePath.value.indexOf('\\') < 0)) {
    message.error(t('settings.aria.savePathRequired'))
    return
  }

  let val2 = ariaUrl.value
  val2 = val2.replaceAll('：', ':')
  if (val2.indexOf('://') > 0) val2 = val2.substring(val2.indexOf('://') + 3)
  if (val2.indexOf('/js') > 0) val2 = val2.substring(0, val2.indexOf('/js'))
  ariaUrl.value = val2.trim()
  if (!ariaUrl || ariaUrl.value.indexOf(':') < 0) {
    message.error(t('settings.aria.addressRequired'))
    return
  }

  ariaPwd.value = ariaPwd.value.trim()
  if (!ariaPwd) {
    message.error(t('settings.aria.secretRequired'))
    return
  }

  settingStore.updateStore({ ariaSavePath: ariaSavePath.value, ariaUrl: ariaUrl.value, ariaPwd: ariaPwd.value, ariaLoading: true })



  try {
    const host = ariaUrl.value.split(':')[0]
    const port = parseInt(ariaUrl.value.split(':')[1])
    const secret = ariaPwd.value

    AriaTest(settingStore.ariaHttps, host, port, secret).then((issuccess: boolean) => {
      if (issuccess) {
        settingStore.updateStore({ ariaState: 'remote' })
        AriaChangeToRemote().then((isOnline: boolean | undefined) => {
          settingStore.ariaLoading = false
          if (isOnline == true) {
            message.success(t('settings.aria.remoteSuccess'))
          } else if (isOnline == undefined) {
            message.warning(t('settings.aria.remoteBusy'))
          } else {
            message.error(t('settings.aria.remoteFailed'))
          }
        })
      } else {
        settingStore.ariaLoading = false
      }
    })
  } catch (e: any) {
    settingStore.ariaLoading = false
    message.error(t('settings.aria.dataFormatError') + e.message)
  }
}
const handleAriaOff = (tip: boolean) => {
  settingStore.updateStore({ ariaState: 'local', ariaLoading: true })

  AriaChangeToLocal()
    .then((isOnline: boolean) => {
      settingStore.ariaLoading = false
      if (tip) {
        if (isOnline) message.warning(t('settings.aria.localConnected'))
        else message.error(t('settings.aria.localFailed'))
      }
    })
    .catch(() => {
      settingStore.ariaLoading = false
      message.error(t('settings.aria.localFailed'))
    })
}

const handleSyncTrackers = async () => {
  trackerSyncing.value = true
  try {
    const texts = await Promise.all(
      settingStore.ariaTrackerSources.map((url) => fetchTrackerSource(url))
    )
    const ariaBtTracker = normalizeTrackerText(texts.join('\n'))
    settingStore.updateStore({ ariaBtTracker })
    await AriaApplyAdvancedOptions()
    message.success(t('settings.aria.trackerSynced'))
  } catch (error: any) {
    message.error(error?.message || t('settings.aria.trackerSyncFailed'))
  } finally {
    trackerSyncing.value = false
  }
}
</script>

<template>
  <div class="settingcard">
    <div class="settinghead">{{ t('settings.remoteAria') }}</div>
    <a-alert banner>{{ t('settings.aria.remoteDownloadTip') }}</a-alert>
    <div class="settingspace"></div>

    <div class="settinghead">{{ t('settings.aria.savePath') }}</div>
    <div class="settingrow">
      <a-input tabindex="-1" :disabled="!settingStore.AriaIsLocal" :style="{ width: '300px' }" :placeholder="t('settings.aria.savePathPlaceholder')" v-model:model-value="ariaSavePath" />
      <a-popover position="bottom">
        <IconFont name="iconbulb" />
        <template #content>
          <div>
            {{ t('settings.aria.savePathTip') }}
          </div>
        </template>
      </a-popover>
    </div>
    <div class="settingspace"></div>
    <div class="settinghead">{{ t('settings.aria.rpcAddress') }}</div>
    <div class="settingrow">
      <a-input tabindex="-1" :disabled="!settingStore.AriaIsLocal" :style="{ width: '300px' }" :placeholder="t('settings.aria.rpcPlaceholder')" v-model:model-value="ariaUrl">
        <template #prefix> ws:// </template>
        <template #suffix> /jsonrpc </template>
      </a-input>

      <a-popover position="bottom">
        <IconFont name="iconbulb" />
        <template #content>
          <div>
            {{ t('settings.aria.rpcTip') }}
          </div>
        </template>
      </a-popover>
    </div>
    <div class="settingspace"></div>
    <div class="settinghead">{{ t('settings.aria.secret') }}</div>
    <div class="settingrow">
      <a-input tabindex="-1" :disabled="!settingStore.AriaIsLocal" :style="{ width: '300px' }" :placeholder="t('settings.aria.secretPlaceholder')" v-model:model-value="ariaPwd" />
      <a-popover position="bottom">
        <IconFont name="iconbulb" />
        <template #content>
          <div>
            {{ t('settings.aria.secretTip') }}
          </div>
        </template>
      </a-popover>
    </div>
    <div class="settingspace"></div>
    <div class="settinghead">{{ t('settings.aria.ssl') }}</div>
    <div class="settingrow">
      <a-checkbox tabindex="-1" :model-value="settingStore.ariaHttps" @change="(v:boolean) => cb({ ariaHttps: v })">{{ t('settings.aria.useSsl') }}</a-checkbox>

      <a-popover position="right">
        <IconFont name="iconbulb" />
        <template #content>
          <div>
            <span class="opred">{{ t('settings.aria.defaultUnchecked') }}</span><br />
            {{ t('settings.aria.sslTip') }}
          </div>
        </template>
      </a-popover>
    </div>
    <div class="settingspace"></div>
    <div class="settinghead">{{ t('settings.aria.status') }}</div>
    <div class="settingrow" v-show="settingStore.AriaIsLocal">
      <a-button type="outline" size="small" tabindex="-1" :loading="settingStore.ariaLoading" @click="handleAriaConn">{{ t('settings.aria.localModeButton') }}</a-button>
    </div>
    <div class="settingrow" v-show="!settingStore.ariaLoading && settingStore.AriaIsLocal">
      <a-typography-text type="secondary">{{ t('settings.aria.localModeTip') }}</a-typography-text>
    </div>

    <div class="settingrow" v-show="!settingStore.AriaIsLocal">
      <a-button type="primary" size="small" tabindex="-1" :loading="settingStore.ariaLoading" @click="handleAriaOff(false)">{{ t('settings.aria.remoteModeButton') }}</a-button>
    </div>
    <div class="settingrow" v-show="!settingStore.ariaLoading && !settingStore.AriaIsLocal">
      <a-typography-text type="secondary">{{ t('settings.aria.remoteModeTip') }}</a-typography-text>
    </div>

    <div class="settingspace"></div>
    <div class="settinghead">BT Tracker</div>
    <div class="settingrow">
      <a-textarea
        :model-value="settingStore.ariaBtTracker"
        :auto-size="{ minRows: 3, maxRows: 6 }"
        :placeholder="t('settings.aria.trackerPlaceholder')"
        @update:model-value="(v: string) => cb({ ariaBtTracker: v })"
        style="width: 460px; font-size: 12px"
      />
    </div>
    <div class="settingrow">
      <a-button :loading="trackerSyncing" size="small" type="outline" tabindex="-1" @click="handleSyncTrackers">{{ t('settings.aria.syncTracker') }}</a-button>
      <span class="settingitem">{{ t('settings.aria.autoSyncEvery12h') }}</span>
    </div>

    <div class="settingspace"></div>
    <div class="settinghead">{{ t('settings.aria.seeding') }}</div>
    <div class="settingrow">
      <span class="settinglabel">{{ t('settings.aria.seedRatio') }}</span>
      <a-input-number tabindex="-1" :model-value="settingStore.ariaSeedRatio" :min="0" :step="0.5" :style="{ width: '100px' }" @update:model-value="(v: number) => { cb({ ariaSeedRatio: v || 0 }); applyAriaOptions() }" />
      <span class="settingitem">{{ t('settings.aria.times') }}</span>
      <span class="settinglabel" style="margin-left: 16px">{{ t('settings.aria.seedTime') }}</span>
      <a-input-number tabindex="-1" :model-value="settingStore.ariaSeedTime" :min="0" :step="60" :style="{ width: '100px' }" @update:model-value="(v: number) => { cb({ ariaSeedTime: v || 0 }); applyAriaOptions() }" />
      <span class="settingitem">{{ t('settings.aria.minutes') }}</span>
    </div>
    <div class="settingrow">
      <a-checkbox tabindex="-1" :model-value="settingStore.ariaBtSaveMetadata" @change="(v:boolean) => cb({ ariaBtSaveMetadata: v })">
        {{ t('settings.downloadAdvanced.saveBtMetadata') }}
      </a-checkbox>
    </div>
    <div class="settingrow">
      <a-checkbox tabindex="-1" :model-value="settingStore.ariaBtForceEncryption" @change="(v:boolean) => { cb({ ariaBtForceEncryption: v }); applyAriaOptions() }">
        {{ t('settings.downloadAdvanced.forceBtEncryption') }}
      </a-checkbox>
    </div>
    <div class="settingrow">
      <a-checkbox tabindex="-1" :model-value="settingStore.ariaBtAutoDownloadContent" @change="(v:boolean) => cb({ ariaBtAutoDownloadContent: v })">
        {{ t('settings.downloadAdvanced.autoDownloadBtContent') }}
      </a-checkbox>
    </div>

    <div class="settingspace"></div>
    <div class="settinghead">{{ t('settings.downloadAdvanced.networkPorts') }}</div>
    <div class="settingrow">
      <a-checkbox tabindex="-1" :model-value="settingStore.ariaEnableUpnp" @change="(v:boolean) => { cb({ ariaEnableUpnp: v }); applyAriaOptions() }">
        {{ t('settings.downloadAdvanced.upnp') }}
      </a-checkbox>
    </div>
    <div class="settingrow">
      <span class="settinglabel">{{ t('settings.downloadAdvanced.btListenPort') }}</span>
      <a-input-number tabindex="-1" :model-value="settingStore.ariaListenPort" :min="1024" :max="65535" :step="1" :style="{ width: '120px' }" @update:model-value="(v: number) => { cb({ ariaListenPort: v || 6881 }); applyAriaOptions() }" />
      <a-popover position="right">
        <IconFont name="iconbulb" />
        <template #content>
          <div>
            {{ t('settings.defaultValue') }}<span class="opred">6881</span>
            <hr />
            {{ t('settings.downloadAdvanced.btListenPortTip') }}<br />
            {{ t('settings.downloadAdvanced.restartAriaTip') }}
          </div>
        </template>
      </a-popover>
    </div>
    <div class="settingrow">
      <span class="settinglabel">{{ t('settings.downloadAdvanced.dhtListenPort') }}</span>
      <a-input-number tabindex="-1" :model-value="settingStore.ariaDhtListenPort" :min="1024" :max="65535" :step="1" :style="{ width: '120px' }" @update:model-value="(v: number) => { cb({ ariaDhtListenPort: v || 6881 }); applyAriaOptions() }" />
      <a-popover position="right">
        <IconFont name="iconbulb" />
        <template #content>
          <div>
            {{ t('settings.defaultValue') }}<span class="opred">6881</span>
            <hr />
            {{ t('settings.downloadAdvanced.dhtListenPortTip') }}<br />
            {{ t('settings.downloadAdvanced.restartAriaTip') }}
          </div>
        </template>
      </a-popover>
    </div>

    <div class="settingspace"></div>
    <div class="settinghead">{{ t('settings.downloadAdvanced.transferSettings') }}</div>
    <div class="settingrow">
      <span class="settinglabel">{{ t('settings.aria.uploadLimit') }}</span>
      <a-input-number
        tabindex="-1"
        :model-value="settingStore.ariaMaxOverallUploadLimit"
        :min="0"
        :step="100"
        :style="{ width: '140px' }"
        @update:model-value="(v: number) => cb({ ariaMaxOverallUploadLimit: v || 0 })"
      />
    </div>
    <div class="settingrow">
      <span class="settinglabel">{{ t('settings.downloadAdvanced.globalUserAgent') }}</span>
      <a-textarea tabindex="-1" :model-value="settingStore.ariaUserAgent" :auto-size="{ minRows: 1, maxRows: 3 }" :style="{ width: '460px' }" :placeholder="t('settings.downloadAdvanced.globalUserAgentPlaceholder')" @update:model-value="(v: string) => cb({ ariaUserAgent: v })" />
    </div>
    <div class="settingrow">
      <a-checkbox tabindex="-1" :model-value="settingStore.ariaContinueDownload" @change="(v:boolean) => cb({ ariaContinueDownload: v })">
        {{ t('settings.downloadAdvanced.continueDownload') }}
      </a-checkbox>
      <a-popover position="right">
        <IconFont name="iconbulb" />
        <template #content>
          <div>
            {{ t('settings.defaultValue') }}<span class="opred">{{ t('settings.on') }}</span>
            <hr />
            {{ t('settings.downloadAdvanced.continueTipOn') }}<br />
            {{ t('settings.downloadAdvanced.continueTipOff') }}
          </div>
        </template>
      </a-popover>
    </div>

    <div class="settingspace"></div>
    <div class="settinghead">{{ t('settings.aria.notifications') }}</div>
    <div class="settingrow">
      <a-checkbox tabindex="-1" :model-value="settingStore.ariaTaskNotification" @change="(v:boolean) => cb({ ariaTaskNotification: v })">
        {{ t('settings.downloadAdvanced.taskNotification') }}
      </a-checkbox>
    </div>

    <div class="settingspace"></div>
    <div class="settinghead">{{ t('settings.aria.browserIntegration') }}</div>
    <div class="settingrow">
      <span class="settinglabel">{{ t('settings.aria.rpcUrl') }}</span>
      <a-input readonly :model-value="`http://localhost:${settingStore.ariaRpcListenPort}/jsonrpc`" :style="{ width: '260px' }" />
    </div>
    <div class="settingrow">
      <span class="settinglabel">{{ t('settings.aria.token') }}</span>
      <a-input readonly :model-value="settingStore.ariaRpcSecret" :style="{ width: '260px' }" />
    </div>
    <div class="settingrow">
      <a-alert type="info" :content="t('settings.aria.extensionTip')" />
    </div>
  </div>
</template>

<style></style>
