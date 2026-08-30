<script setup lang='ts'>
import { h, ref } from 'vue'
import { ITokenInfo, useSettingStore, useUserStore } from '../store'
import UserDAL from '../user/userdal'
import Config from '../config'
import message from '../utils/message'
import DebugLog from '../utils/debuglog'
import { GetSignature } from '../aliapi/utils'
import getUuid from 'uuid-by-string'
import AliUser from '../aliapi/user'
import AliHttp from '../aliapi/alihttp'
import { Input, Modal, Space } from '@arco-design/web-vue'
import { ALIYUN_APP_ID, ALIYUN_APP_SECRET } from '../secrets.generated'
import { t } from '../i18n'

const useUser = useUserStore()
const settingStore = useSettingStore()
const loginCur = ref(1)
const loginToken = ref<ITokenInfo>()
const loginStatus = ref<'wait' | 'error' | 'finish' | 'process'>('process')
const loginLoading = ref(true)
const client_id = ref(ALIYUN_APP_ID)
const client_secret = ref(ALIYUN_APP_SECRET)

const intervalId = ref()
const qrCodeUrl = ref('')
const qrCodeStatusType = ref()
const qrCodeStatusTips = ref()

let loginOpenTimer: any = null
let aliyunLoginHandled = false
let aliyunWebviewInitialized = false

const getAliyunLoginWebview = () => document.getElementById('loginiframe') as any

const clearOpenTimers = () => {
  if (loginOpenTimer) {
    clearTimeout(loginOpenTimer)
    loginOpenTimer = null
  }
}

const handleModalOpen = () => {
  handleOpen()
}

const cb = (val: any) => {
  settingStore.updateStore(val)
}

function b64decode(e: string) {
  const t = atob(e)
  let r = t.length
  const n = new Uint8Array(r)
  while (r--) n[r] = t.charCodeAt(r)
  return new Blob([n])
}

function readData(e: string) {
  return new Promise<string>(function(resolve, reject) {
    const n = b64decode(e)
    const i = new FileReader()
    i.onloadend = function(e) {
      resolve((e?.target?.result as string | undefined) || '')
    }
    i.onerror = function(e) {
      return reject(e)
    }
    i.readAsText(n, 'gbk')
  })
}

const refreshStepTips = (status: 'error' | 'finish' | 'process', index: number) => {
  loginStatus.value = status
  loginLoading.value = index !== loginCur.value
  loginCur.value = index
}

const refreshQrCodeStatus = (codeUrl: string = '', type: string = 'info', tips: string = t('login.scanWithAliyun')) => {
  qrCodeUrl.value = codeUrl
  qrCodeStatusType.value = type
  qrCodeStatusTips.value = tips
}

const handleOpen = () => {
  clearOpenTimers()
  loginOpenTimer = setTimeout(() => {
    if (!useUser.userShowLogin) return
    const webview = getAliyunLoginWebview()
    if (!webview) {
      message.error(t('login.loginFailed'))
      return
    }
    if (aliyunWebviewInitialized) {
      loginLoading.value = typeof webview.isLoading === 'function' ? webview.isLoading() : false
      return
    }
    aliyunWebviewInitialized = true
    if (import.meta.env.DEV) {
      try {
        webview.openDevTools({ mode: 'bottom', activate: false })
      } catch (err: any) {
        DebugLog.mSaveWarning('Aliyun login webview DevTools open failed ' + (err?.message || err))
      }
    }
    aliyunLoginHandled = false
    const extractBizExt = (payload: string) => {
      try {
        const parsed = JSON.parse(payload)
        if (parsed?.bizExt) return String(parsed.bizExt)
      } catch {
        // Some versions of the login page print a JavaScript object instead of JSON.
      }
      const match = payload.match(/["']?bizExt["']?\s*[:=]\s*["']([^"']+)["']/i)
      return match?.[1] || ''
    }
    const handleLoginPayload = (payload: string) => {
      try {
        const parsed = JSON.parse(payload)
        if (parsed?.code && !aliyunLoginHandled) {
          aliyunLoginHandled = true
          loginStepFirst(payload)
          try {
            webview.stop()
          } catch {
            // ignore navigation stop errors after the OAuth callback is received
          }
          return true
        }
      } catch {
        // Continue with the legacy bizExt parser below.
      }
      const bizExt = extractBizExt(payload)
      if (aliyunLoginHandled || !bizExt) return false
      aliyunLoginHandled = true
      loginStepFirst(JSON.stringify({ bizExt }))
      try {
        webview.stop()
      } catch {
        // ignore navigation stop errors after the login callback is received
      }
      return true
    }
    const handleLoginNavigation = (event: any) => {
      const url = event?.url || ''
      if (!url) return
      try {
        const parsed = new URL(url)
        const code = parsed.searchParams.get('code') || ''
        if (code && handleLoginPayload(JSON.stringify({ code }))) {
          event?.preventDefault?.()
          return
        }
        if (!url.includes('bizExt')) return
        const bizExt = parsed.searchParams.get('bizExt') || new URLSearchParams(parsed.hash.replace(/^#\??/, '')).get('bizExt')
        if (bizExt && handleLoginPayload(JSON.stringify({ bizExt }))) event?.preventDefault?.()
      } catch (err: any) {
        DebugLog.mSaveWarning('Aliyun login callback parse failed ' + (err?.message || err))
      }
    }
    webview.addEventListener('will-navigate', handleLoginNavigation)
    webview.addEventListener('did-navigate', handleLoginNavigation)
    webview.addEventListener('did-redirect-navigation', handleLoginNavigation)
    webview.addEventListener('did-navigate-in-page', handleLoginNavigation)
    webview.addEventListener('console-message', (e: any) => {
      const msg = e.message || ''
      loginLoading.value = false
      handleLoginPayload(msg)
    })
    const load = webview.loadURL(Config.loginUrl, { httpReferrer: Config.referer })
    if (load?.catch) {
      load.catch((err: any) => {
        loginLoading.value = false
        if (useUser.userShowLogin) DebugLog.mSaveWarning('Aliyun login webview load failed ' + (err?.message || err))
      })
    }
    webview.addEventListener('did-finish-load', () => {
      loginLoading.value = false
    })
    webview.addEventListener('did-fail-load', () => {
      loginLoading.value = false
    })
  }, 1000)
}

const handleClose = () => {
  aliyunWebviewInitialized = false
  loginLoading.value = true
  client_id.value = ALIYUN_APP_ID
  client_secret.value = ALIYUN_APP_SECRET
  clearInterval(intervalId.value)
  clearOpenTimers()
  refreshStepTips('process', 1)
  refreshQrCodeStatus()
}

const loginStepFirst = async (msg: string) => {
  let data: { bizExt?: string; code?: string } = {}
  try {
    data = JSON.parse(msg)
  } catch {
  }
  if (!data.bizExt && !data.code) {
    refreshStepTips('error', 1)
    DebugLog.mSaveDanger('登录失败：' + msg)
    return
  }
  const resultPromise = data.code
    ? AliUser.LoginByOAuthCode(data.code).then((resp: any) => {
      if (!AliHttp.IsSuccess(resp.code)) throw new Error(resp.body?.message || resp.body?.code || `OAuth code exchange failed: ${resp.code}`)
      const body = resp.body?.token_info || resp.body?.tokenInfo || resp.body
      return {
        accessToken: body.accessToken || body.access_token,
        refreshToken: body.refreshToken || body.refresh_token,
        tokenType: body.tokenType || body.token_type,
        expiresIn: body.expiresIn || body.expires_in,
        userId: body.userId || body.user_id,
        userName: body.userName || body.user_name,
        avatar: body.avatar,
        nickName: body.nickName || body.nick_name,
        defaultSboxDriveId: body.defaultSboxDriveId || body.default_sbox_drive_id,
        role: body.role,
        status: body.status,
        expireTime: body.expireTime || body.expire_time,
        state: body.state,
        dataPinSetup: body.dataPinSetup || body.data_pin_setup,
        isFirstLogin: body.isFirstLogin || body.is_first_login,
        needRpVerify: body.needRpVerify || body.need_rp_verify
      }
    })
    : readData(data.bizExt || '').then((jsonstr: string) => JSON.parse(jsonstr).pds_login_result)
  resultPromise.then((result: any) => {
    try {
      const deviceId = getUuid(result.userId.toString(), 5)
      const { signature } = GetSignature(0, result.userId.toString(), deviceId)
      const token: ITokenInfo = {
        tokenfrom: 'aliyun',
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
        session_expires_in: 0,
        open_api_token_type: '',
        open_api_access_token: '',
        open_api_refresh_token: '',
        open_api_expires_in: 0,
        expires_in: result.expiresIn,
        token_type: result.tokenType,
        user_id: result.userId,
        user_name: result.userName,
        avatar: result.avatar,
        nick_name: result.nickName,
        default_drive_id: '',
        default_sbox_drive_id: result.defaultSboxDriveId,
        resource_drive_id: '',
        backup_drive_id: '',
        sbox_drive_id: '',
        role: result.role,
        status: result.status,
        expire_time: result.expireTime,
        state: result.state,
        pin_setup: result.dataPinSetup,
        is_first_login: result.isFirstLogin,
        need_rp_verify: result.needRpVerify,
        name: '',
        spu_id: '',
        is_expires: false,
        used_size: 0,
        total_size: 0,
        free_size: 0,
        space_expire: false,
        spaceinfo: '',
        pic_drive_id: '',
        vipname: '',
        vipexpire: '',
        vipIcon: '',
        device_id: deviceId,
        signature: signature,
        signInfo: {
          signMon: -1,
          signDay: -1
        }
      }
      loginToken.value = token
      if (settingStore.uiEnableOpenApiType === 'custom') {
        client_id.value = settingStore.uiOpenApiClientId.trim()
        client_secret.value = settingStore.uiOpenApiClientSecret.trim()
      } else {
        client_id.value = ALIYUN_APP_ID
        client_secret.value = ALIYUN_APP_SECRET
      }
      refreshStepTips('process', 2)
      loginStepSecond(token)
    } catch (err: any) {
      refreshStepTips('error', 1)
      message.error(t('login.loginFailed') + '：' + (err.message || t('login.parseFailed')))
      DebugLog.mSaveDanger('登录失败：' + (err.message || '解析失败'), JSON.stringify(err))
    }
  }).catch((err: any) => {
    refreshStepTips('error', 1)
    message.error(t('login.loginFailed') + '：' + (err?.message || t('login.retry')))
    DebugLog.mSaveDanger('Aliyun login result read failed', err)
  })
}

const loginStepSecond = async (token: ITokenInfo) => {
  if (!token) {
    refreshStepTips('process', 1)
    message.error(t('login.retryLogin'))
    return
  }
  loginLoading.value = false
  clearInterval(intervalId.value)
  let codeUrl = ''
  try {
    codeUrl = await AliUser.OpenApiQrCodeUrl(client_id.value, client_secret.value, 250, 250)
  } catch (err: any) {
    refreshQrCodeStatus('', 'error', t('login.loginFailed'))
    refreshStepTips('error', 2)
    DebugLog.mSaveDanger('Aliyun second QR code request failed', err)
    return
  }
  if (!codeUrl) {
    refreshQrCodeStatus('', 'error', t('login.loginFailed'))
    refreshStepTips('error', 2)
    handlerChangeType()
    return
  }
  refreshQrCodeStatus(codeUrl, 'info', t('login.waitingScan'))
  refreshStepTips('process', 2)
  // 监听状态
  intervalId.value = setInterval(async () => {
    try {
      const result = await AliUser.OpenApiQrCodeStatus(codeUrl)
      if (!result || typeof result !== 'object') return
      const { authCode, statusCode, statusType, statusTips } = result
    if (!statusCode) {
      refreshQrCodeStatus()
      clearInterval(intervalId.value)
      return
    }
    refreshQrCodeStatus(codeUrl, statusType, statusTips)
    if (statusCode === 'QRCodeExpired') {
      clearInterval(intervalId.value)
      refreshQrCodeStatus()
      return
    }
      if (authCode && statusCode === 'LoginSuccess') {
      // 构造请求体
      await AliUser.OpenApiLoginByAuthCode(token, client_id.value, client_secret.value, authCode)
      loginSuccess(token)
        clearInterval(intervalId.value)
      }
    } catch (err: any) {
      clearInterval(intervalId.value)
      refreshQrCodeStatus('', 'error', t('login.loginFailed'))
      DebugLog.mSaveWarning('Aliyun second QR code status failed', err)
    }
  }, 1500)
}

const handlerChangeType = () => {
  clearInterval(intervalId.value)
  refreshQrCodeStatus()
  if (settingStore.uiEnableOpenApiType === 'custom') {
    Modal.open({
      title: t('login.enterDeveloperAccount'),
      bodyStyle: { minWidth: '340px' },
      content: () => h(Space, { direction: 'vertical' }, () => [
        h(Input, {
          type: 'text',
          tabindex: '-1',
          allowClear: true,
          modelValue: settingStore.uiOpenApiClientId.trim(),
          style: { width: '340px' },
          placeholder: t('login.clientId'),
          'onUpdate:modelValue': (e) => cb({ uiOpenApiClientId: e.trim() })
        }),
        h(Input, {
          type: 'text',
          tabindex: '-1',
          allowClear: true,
          modelValue: settingStore.uiOpenApiClientSecret.trim(),
          style: { width: '340px' },
          placeholder: t('login.clientSecret'),
          'onUpdate:modelValue': (e) => cb({ uiOpenApiClientSecret: e.trim() })
        })
      ]),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onBeforeOk: async (e: any) => {
        if (settingStore.uiOpenApiClientId && settingStore.uiOpenApiClientSecret) {
          client_id.value = settingStore.uiOpenApiClientId
          client_secret.value = settingStore.uiOpenApiClientSecret
          handleRefreshQrCodeUrl()
          return true
        } else {
          message.error(t('login.enterDeveloperAccountWarn'))
          return false
        }
      }
    })
  } else {
    client_id.value = ALIYUN_APP_ID
    client_secret.value = ALIYUN_APP_SECRET
    handleRefreshQrCodeUrl()
  }
}

const handleRefreshQrCodeUrl = () => {
  refreshQrCodeStatus()
  clearInterval(intervalId.value)
  loginStepSecond(loginToken.value!!)
}

const loginSuccess = (token: ITokenInfo) => {
  UserDAL.UserLogin(token, true)
    .then(() => {
      if (window.WebClearCookies) {
        window.WebClearCookies({
          origin: 'https://auth.aliyundrive.com',
          storages: ['cookies', 'localstorage']
        })
      }
      refreshStepTips('process', 3)
      refreshQrCodeStatus()
      useUserStore().userShowLogin = false
    })
    .catch(() => {
      useUserStore().userShowLogin = false
      if (window.WebClearCookies) {
        window.WebClearCookies({
          origin: 'https://auth.aliyundrive.com',
          storages: ['cookies', 'localstorage']
        })
      }
      refreshQrCodeStatus()
    })
}

</script>

<template>
  <a-modal :title="t('login.driveAccount')" v-model:visible='useUser.userShowLogin'
           :mask-closable='false' unmount-on-close :footer='false'
           class='userloginmodal' @before-open='handleModalOpen' @close='handleClose'>
    <div class="modalbody login-modal-body">
      <section class="login-provider-content">
        <div>
          <a-steps v-model:current="loginCur" :status="loginStatus">
            <a-step :description="t('login.scanOrAccount')">{{ t('login.firstScan') }}</a-step>
            <a-step :description="t('login.mobileAuth')">{{ t('login.secondScan') }}</a-step>
          </a-steps>
          <div id='logindiv'>
            <div class='logincontent'>
            <div id="loginframediv" class="loginframe">
              <a-spin class="loading" :size="32" v-if='loginLoading' :tip="t('common.loading')" />
              <Webview id="loginiframe" v-show='!loginLoading && loginCur === 1'
                       plugins nodeintegration disablewebsecurity
                       webpreferences="allowRunningInsecureContent"
                       src="about:blank" style="width: 100%; height: 400px; border: none; overflow: hidden" />
              <div class="qrcodeframe" v-if="loginCur === 2 && !loginLoading">
                <a-image
                  width='250'
                  height='250'
                  :hide-footer='true'
                  :preview='false'
                  :show-loader="true"
                  @click="handleRefreshQrCodeUrl"
                  style="display:inline-block;"
                  :src="qrCodeUrl">
                </a-image>
                <a-alert banner center :show-icon="false" :type='qrCodeStatusType'>
                  {{ qrCodeStatusTips }}
                </a-alert>
              </div>
            </div>
          </div>
        </div>
        </div>

      </section>
    </div>
  </a-modal>
</template>
<style lang="less" scoped>
#logindiv {
  overflow: hidden;
  text-align: center;

  .logincontent {
    position: relative;
    width: 348px;
    height: 367px;
    min-height: 400px;
    margin: 0 auto;
    overflow: hidden;
    text-align: center;

    .loginframe {
      overflow: hidden;
      position: relative;
      width: 100%;
      height: 100%
    }

    .qrcodeframe {
      border-radius: 10px;
      padding: 5px;
      box-shadow: grey 0 0 10px;
      margin: 40px 15px 15px 15px;
    }

    .loading {
      min-height: 60px;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    }
  }
}

.userloginmodal .arco-modal-body {
  min-height: 440px;
  padding: 0 16px 16px 16px !important;
}

.login-modal-body {
  display: flex;
  width: 540px;
  height: 458px;
  overflow: hidden;
}
.login-provider-content {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  padding: 8px 0 0 16px;
  overflow: hidden;
}
</style>
