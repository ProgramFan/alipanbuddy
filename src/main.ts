import './polyfills'
import './axios'
import { createApp } from 'vue'
// Stylesheet order is load-bearing. The framework theme goes first, then the
// Arco -> Material token bridge, and only then the app's own CSS (App.vue pulls
// in global.css, antd.css and every component <style> block). Importing the app
// before the framework is what forced hundreds of !important declarations: our
// rules were losing every equal-specificity tie to Arco.
// Stock Arco. The @arco-themes/vue-gi-demo theme this replaced hardcoded 45
// literal radii and 24 literal hex colours, which the token bridge cannot reach.
import '@arco-design/web-vue/dist/arco.css'
import './assets/arco-tokens.css'
import App from './App.vue'
import ArcoVue from '@arco-design/web-vue'
import store, { useAppStore, useSettingStore } from './store'
import message from './utils/message'
import DebugLog from './utils/debuglog'
import { PageMain } from './layout/PageMain'
import { WorkerPage } from './workerpage/workercmd'
import { setLocale } from './i18n'
import UserDAL from './user/userdal'
import IconFont from './components/IconFont.vue'
import { getPageContext, getThemeState, initBridge, listen, markWorkerReady, parsePageRoute } from './tauri/bridge'
import { installProxyUrlResolver } from './tauri/proxyResolver'
import { installDragDropUpload } from './tauri/dragDrop'

window.onerror = function (errorMessage, scriptURI, lineNo, columnNo, error) {
  try {
    if (errorMessage && typeof errorMessage === 'string') {
      if (errorMessage.indexOf('ResizeObserver') >= 0 || errorMessage.indexOf('listen EADDRINUSE') >= 0 || errorMessage.indexOf('connect ENOENT') >= 0) {
        return true
      }
    }
    if (typeof errorMessage === 'string') {
      DebugLog.mSaveDanger(errorMessage)
      message.error('onerror ' + errorMessage)
    }
    if (error) {
      DebugLog.mSaveDanger('onerror', error)
      message.error('onerror ' + error.message)
    }
  } catch {}
  return true
}

window.addEventListener('unhandledrejection', function (event) {
  try {
    if (event.reason && event.reason.message && event.reason.message.indexOf('oauth/authorize?') > 0) {
      event.stopPropagation()
      event.preventDefault()
      return
    }
    const reason = event.reason
    if (reason && reason.message) {
      if (/no supported source/i.test(reason.message)) {
        message.error('不支持当前媒体类型', 1)
        event.stopPropagation()
        event.preventDefault()
        return
      }
      DebugLog.mSaveDanger('unhandledrejection', reason)
      message.error('rejection ' + reason.message, 1)
    }
    if (!reason) DebugLog.mSaveDanger('unhandledrejection', JSON.stringify(event))
  } catch {}
  event.stopPropagation()
  event.preventDefault()
})

async function bootstrap() {
  // Platform info + window.* bridge must exist before any store/module touches them.
  await initBridge()

  const app = createApp(App)
  app.component('IconFont', IconFont)
  app.config.errorHandler = function (err: any, vm, info) {
    try {
      if (typeof err === 'string') {
        DebugLog.mSaveDanger('errorHandler', err)
        message.error('errorHandler ' + err, 1)
      } else {
        DebugLog.mSaveDanger('errorHandler', err)
        if (err && err.message) message.error('errorHandler ' + err.message, 1)
      }
    } catch {}
    return true
  }
  app.use(ArcoVue, {})
  app.use(store)
  const settingStore = useSettingStore()
  setLocale(settingStore.uiLanguage)
  settingStore.$subscribe((_mutation, state) => setLocale(state.uiLanguage))
  app.mount('#app')

  const appStore = useAppStore()
  try {
    const { theme, dark } = await getThemeState()
    if (theme) appStore.toggleTheme(theme)
    appStore.toggleDark(!!dark)
  } catch {}
  await listen<{ theme?: string; dark: boolean }>('setTheme', (event) => {
    const args = event.payload || ({} as any)
    if (args.theme) appStore.toggleTheme(args.theme)
    appStore.toggleDark(!!args.dark)
  })

  const route = parsePageRoute()
  if (route.page === 'PageWorker') {
    WorkerPage('upload')
    appStore.togglePage('PageWorker')
    await markWorkerReady('upload')
  } else if (route.page === 'PageImage') {
    const ctx = await getPageContext()
    const pageUserId = String(ctx?.data?.user_id || '')
    if (pageUserId) await UserDAL.GetUserTokenFromDB(pageUserId)
    if (ctx?.theme) appStore.toggleTheme(ctx.theme)
    appStore.pageImage = ctx?.data
    appStore.togglePage('PageImage')
  } else {
    installProxyUrlResolver()
    installDragDropUpload()
    PageMain()
    appStore.togglePage('PageMain')
  }
}

bootstrap().catch((err: any) => {
  console.error('bootstrap failed', err)
  try {
    DebugLog.mSaveDanger('bootstrap', err)
  } catch {}
})
