<script setup lang='ts'>
import { computed } from 'vue'
import message from '../utils/message'
import UserDAL, { UserTokenMap } from '../user/userdal'
import { ITokenInfo, useSettingStore } from '../store'
import { copyToClipboard, openExternal } from '../utils/electronhelper'
import Db from '../utils/db'
import fs from '../tauri/fs'
import path from '../utils/path'
import { decodeName, encodeName } from '../module/flow-enc/utils'
import { localPwd } from '../utils/aria2c'
import { ALIYUN_APP_ID } from '../secrets.generated'
import { t } from '../i18n'

const settingStore = useSettingStore()

const cb = (val: any) => {
  settingStore.updateStore(val)
}

// Without built-in credentials in this build, the only usable mode is 'custom'.
const hasBuiltinOpenApi = !!ALIYUN_APP_ID
const openApiType = computed(() => (hasBuiltinOpenApi ? settingStore.uiEnableOpenApiType || 'inline' : 'custom'))
const showCustomOpenApi = computed(() => openApiType.value === 'custom')

const openWebUrl = (type: string) => {
  switch (type) {
    case 'developer':
      openExternal('https://www.aliyundrive.com/developer')
      break
    case 'pkce':
      openExternal('https://www.yuque.com/aliyundrive/zpfszx/eam8ls1lmawwwksv')
      break
    case 'AList':
      openExternal('https://alist.nn.ci/tool/aliyundrive/request.html')
      break
  }
}

const copyCookies = async () => {
  let cookies = await window.WebGetCookies({ url: 'https://www.aliyundrive.com' }) as []
  if (cookies.length == 0) cookies = await window.WebGetCookies({ url: 'https://www.aliyundrive.com' }) as []
  if (cookies.length > 0) {
    let cookiesText = ''
    cookies.forEach(cookie => {
      cookiesText += cookie['name'] + '=' + cookie['value'] + ';'
    })
    copyToClipboard(cookiesText)
    message.success(t('settings.account.cookiesCopied'))
  } else {
    message.error(t('settings.account.cookiesMissing'))
  }
}

const handlerAccountImport = () => {
  window.WebShowOpenDialogSync({
    title: t('settings.account.selectImportFile'),
    buttonLabel: t('settings.account.importSelectedFile'),
    filters: [{ name: 'user.db', extensions: ['db'] }],
    properties: ['openFile', 'multiSelections', 'showHiddenFiles', 'noResolveAliases', 'treatPackageAsDirectory', 'dontAddToRecent']
  }, async (files: string[] | undefined) => {
    if (files && files.length > 0) {
      try {
        // 获取内容
        let userList: ITokenInfo[] = []
        let uniqueUserIds = new Set()
        for (let filePath of files) {
          let readData = await fs.readTextFile(filePath)
          let parsedData: any = JSON.parse(<string>decodeName(localPwd, 'aesctr', readData))
          if (Array.isArray(parsedData) && parsedData.every(item => item.hasOwnProperty('access_token'))) {
            let filteredData: ITokenInfo[] = parsedData.filter((item: ITokenInfo) => {
              if (!uniqueUserIds.has(item.user_id)) {
                uniqueUserIds.add(item.user_id)
                return true
              }
              return false
            })
            userList.push(...filteredData)
          }
        }
        if (userList.length > 0) {
          // 设置UserTokenMap
          for (let token of userList) {
            if (token.user_id) {
              UserTokenMap.set(token.user_id, token)
            }
          }
          // 导入到数据库
          Db.saveUserBatch(userList).then(() => {
            window.WinMsgToUpload({ cmd: 'ClearUserToken' })
          }).catch()
          await UserDAL.UserLogin(userList[0])
          message.success(t('settings.account.importSuccess'))
        } else {
          message.error(t('settings.account.importFailed'))
        }
      } catch (err) {
        message.error(t('settings.account.importFailed'))
      }
    }
  })
}

const handlerAccountExport = () => {
  if (window.WebShowOpenDialogSync) {
    window.WebShowOpenDialogSync(
      {
        title: t('settings.account.selectExportFolder'),
        buttonLabel: t('media.selectFolder'),
        properties: ['openDirectory', 'createDirectory']
      },
      async (result: string[] | undefined) => {
        if (result && result[0]) {
          try {
            let exportFile = path.join(result[0], 'user.db')
            let userList = JSON.stringify(UserDAL.GetUserList())
            let data = encodeName(localPwd, 'aesctr', userList)
            await fs.writeTextFile(exportFile, data)
            message.success(t('settings.account.exportSuccess'))
          } catch (err: any) {
            message.error(t('settings.account.exportFailed') + (err?.message ? ' ' + err.message : ''))
          }
        }
      }
    )
  }
}

</script>

<template>
  <div class='settingcard'>
    <div class='settinghead'>{{ t('settings.account.aliyun') }}</div>
    <div class='settingrow'>
      <a-button type='outline' size='small' tabindex='-1' @click='copyCookies()'>
        {{ t('settings.account.copyCookies') }}
      </a-button>
    </div>
    <div class='settingspace'></div>
    <div class='settinghead'>{{ t('settings.account.openApi') }}
      <a-popover position="bottom">
        <IconFont name="iconbulb" />
        <template #content>
          <div>{{ t('settings.account.openApiTip') }}</div>
        </template>
      </a-popover>
    </div>
    <div v-if='!hasBuiltinOpenApi' class='settingrow'>
      <a-alert type='warning' banner>{{ t('settings.account.openApiMissingBuiltin') }}</a-alert>
    </div>
    <div class='settingrow'>
      <a-radio-group type='button' tabindex='-1' :model-value='openApiType' @update:model-value='cb({ uiEnableOpenApiType: $event })'>
        <a-radio tabindex='-1' value='inline' :disabled='!hasBuiltinOpenApi'>{{ t('settings.account.openApiInline') }}</a-radio>
        <a-radio tabindex='-1' value='custom'>{{ t('settings.account.openApiCustom') }}</a-radio>
      </a-radio-group>
    </div>
    <template v-if='showCustomOpenApi'>
      <div class='settingrow'>
        <a-input tabindex='-1' allow-clear :style="{ width: '320px' }" :placeholder="t('settings.account.openApiClientId')" :model-value='settingStore.uiOpenApiClientId' @update:model-value='cb({ uiOpenApiClientId: $event })' />
      </div>
      <div class='settingrow'>
        <a-input-password tabindex='-1' allow-clear :style="{ width: '320px' }" :placeholder="t('settings.account.openApiClientSecret')" :model-value='settingStore.uiOpenApiClientSecret' @update:model-value='cb({ uiOpenApiClientSecret: $event })' />
      </div>
    </template>
    <div class='settingrow'>
      <span class='settings-openapi-tip'>{{ t('settings.account.openApiTip') }}</span>
    </div>
    <div class='settingrow'>
      <a-button type='outline' size='small' tabindex='-1' @click="openWebUrl('developer')">
        {{ t('settings.account.openApiApply') }}
      </a-button>
    </div>
    <div class='settingspace'></div>
    <div class='settinghead'>{{ t('settings.account.importExport') }}
      <a-popover position="bottom">
        <IconFont name="iconbulb" />
        <template #content>
          <div>
            {{ t('settings.account.importExportTip') }}<br />
            <hr />
            <div class="hrspace"></div>
            <span class="opred">{{ t('settings.account.importExportAll') }}</span><br />
          </div>
        </template>
      </a-popover>
    </div>
    <div class="settingrow">
      <a-button type='outline' status="danger" size='small' tabindex='-1'
                @click='handlerAccountExport'>
        {{ t('settings.account.export') }}
      </a-button>
      <a-button type='outline' size='small' status="success" tabindex='-1' @click='handlerAccountImport'>
        {{ t('settings.account.import') }}
      </a-button>
    </div>
  </div>
</template>

<style scoped>
.settings-openapi-tip {
  max-width: 580px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-3);
}
</style>
