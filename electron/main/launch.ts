import { AppWindow, createMainWindow, createTray } from './core/window'
import { app, ipcMain, session } from 'electron'
import { registerAutoUpdate } from './core/autoUpdate'
import is from 'electron-is'
import fixPath from 'fix-path'
import { release } from 'os'
import { getResourcesPath, getStaticPath } from './utils/mainfile'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { EventEmitter } from 'node:events'
import exception from './core/exception'
import ipcEvent from './core/ipcEvent'
import MotrixApplication from './aria/MotrixApplication'
import { onAppShutdown, registerAppShutdown } from './core/lifecycle'

type UserToken = {
  access_token: string;
  open_api_access_token: string;
  user_id: string;
  tokenfrom?: string;
  refresh: boolean
}

const ALIYUN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0'

export default class launch extends EventEmitter {
  private userToken: UserToken = {
    access_token: '',
    open_api_access_token: '',
    user_id: '',
    refresh: false
  }
  public motrixApp!: MotrixApplication

  constructor() {
    super()
    this.init()
  }

  init() {
    this.start()
    if (is.mas()) return
    const gotSingleLock = app.requestSingleInstanceLock()
    if (!gotSingleLock) {
      app.exit()
    } else {
      app.on('second-instance', (event, commandLine, workingDirectory) => {
        if (commandLine && commandLine.join(' ').indexOf('exit') >= 0) {
          this.hasExitArgv(commandLine)
          return
        }
        if (AppWindow.mainWindow && AppWindow.mainWindow.isDestroyed() == false) {
          if (AppWindow.mainWindow.isMinimized()) {
            AppWindow.mainWindow.restore()
          }
          AppWindow.mainWindow.show()
          AppWindow.mainWindow.focus()
        }
      })
    }
  }

  start() {
    exception.handler()
    this.setInitArgv()
    this.loadUserData()
    this.handleEvents()
    this.handleAppReady()
  }

  setInitArgv() {
    fixPath()
    if (release().startsWith('6.1')) {
      app.disableHardwareAcceleration()
    }
    process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

    app.commandLine.appendSwitch('no-sandbox')
    app.commandLine.appendSwitch('disable-web-security')
    app.commandLine.appendSwitch('disable-renderer-backgrounding')
    app.commandLine.appendSwitch('disable-site-isolation-trials')
    app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors,SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure,BlockInsecurePrivateNetworkRequests')
    app.commandLine.appendSwitch('ignore-connections-limit', 'bj29-enet.cn-beijing.data.alicloudccp.com,bj29-hz.cn-hangzhou.data.alicloudccp.com,bj29.cn-beijing.data.alicloudccp.com,alicloudccp.com,api.aliyundrive.com,aliyundrive.com,api.alipan.com,alipan.com')
    app.commandLine.appendSwitch('ignore-certificate-errors')
    app.commandLine.appendSwitch('proxy-bypass-list', '*')
    app.commandLine.appendSwitch('no-proxy-server')
    app.commandLine.appendSwitch('wm-window-animations-disabled')
    app.commandLine.appendSwitch('force_high_performance_gpu')

    app.name = 'BoxPlayer'
    if (is.windows()) {
      app.setAppUserModelId('com.github.gaozhangmin')
    }
    this.hasExitArgv(process.argv)
  }

  hasExitArgv(args) {
    if (args && args.join(' ').indexOf('exit') >= 0) {
      app.exit()
    }
  }

  loadUserData() {
    const userData = getResourcesPath('userdir.config')
    try {
      if (existsSync(userData)) {
        const configData = readFileSync(userData, 'utf-8')
        if (configData) app.setPath('userData', configData)
      }
    } catch {
    }
  }

  handleEvents() {
    ipcEvent.handleEvents()
    this.handleUserToken()
    this.handleAppActivate()
    this.handleAppWillQuit()
    this.handleAppWindowAllClosed()
  }

  handleAppReady() {
    app
      .whenReady()
      .then(() => {
        try {
          const localVersion = getResourcesPath('localVersion')
          if (localVersion && existsSync(localVersion)) {
            const version = readFileSync(localVersion, 'utf-8')
            if (app.getVersion() > version) {
              writeFileSync(localVersion, app.getVersion(), 'utf-8')
            }
          } else {
            writeFileSync(localVersion, app.getVersion(), 'utf-8')
          }
        } catch (err) {
        }
        session.defaultSession.webRequest.onBeforeSendHeaders((details, cb) => {
          const shouldAliPanOrigin = details.url.indexOf('.aliyundrive.com') > 0 || details.url.indexOf('.alipan.com') > 0
          const shouldAliReferer = !details.referrer || details.referrer.trim() === '' || /(\/localhost:)|(^file:\/\/)|(\/127.0.0.1:)/.exec(details.referrer) !== null
          const shouldToken = shouldAliPanOrigin && details.url.includes('download')
          const shouldOpenApiToken = details.url.includes('adrive/v1.0') || details.url.includes('adrive/v1.1')
          const forbidUrl = details.url.includes('younoyes') || details.url.includes('onatoshi')
          const hasAuthorizationHeader = Object.keys(details.requestHeaders || {}).some((key) => key.toLowerCase() === 'authorization')
          const fallbackAccessToken = this.userToken?.access_token || ''
          const fallbackOpenApiToken = this.userToken?.open_api_access_token || ''

          cb({
            cancel: false,
            requestHeaders: {
              ...details.requestHeaders,
              ...(shouldAliPanOrigin && {
                Origin: 'https://www.aliyundrive.com',
                'user-agent': ALIYUN_UA
              }),
              ...(shouldAliReferer && {
                Referer: 'https://www.aliyundrive.com/',
                'user-agent': ALIYUN_UA
              }),
              ...(forbidUrl && {
                'user-agent': 'SenPlayer'
              }),
              ...(shouldToken && !hasAuthorizationHeader && fallbackAccessToken && {
                Authorization: fallbackAccessToken,
                'user-agent': ALIYUN_UA
              }),
              ...(shouldOpenApiToken && !hasAuthorizationHeader && fallbackOpenApiToken && {
                Authorization: 'Bearer ' + fallbackOpenApiToken,
                'user-agent': ALIYUN_UA
              }),
              ...(shouldAliPanOrigin && {
                'X-Canary': 'client=windows,app=adrive,version=v4.12.0'
              }),
              'Accept-Language': 'zh-CN,zh;q=0.9'
            }
          })
        })
        createMainWindow()
        createTray()
        registerAutoUpdate()
        setTimeout(() => {
          this.motrixApp = new MotrixApplication()
          this.motrixApp.init().catch((err: any) => console.error('[MotrixApp] init failed', err))
        }, 3000)

        const defaultSessionExtensions = session.defaultSession.extensions
        const loadCrxExtension = defaultSessionExtensions?.loadExtension ? defaultSessionExtensions.loadExtension.bind(defaultSessionExtensions) : session.defaultSession.loadExtension.bind(session.defaultSession)
        loadCrxExtension(getStaticPath('crx'), { allowFileAccess: true })
          .catch((err: any) => {
            console.error('[launch] load crx extension failed', err)
          })
      })
      .catch((err: any) => {
        console.log(err)
      })
  }

  handleUserToken() {
    ipcMain.on('WebUserToken', (event, data) => {
      if (data.login) {
        this.userToken = data
      } else if (this.userToken.user_id == data.user_id) {
        this.userToken = data
      }
    })
  }

  handleAppActivate() {
    app.on('activate', () => {
      if (!AppWindow.mainWindow || AppWindow.mainWindow.isDestroyed()) createMainWindow()
      else {
        if (AppWindow.mainWindow.isMinimized()) AppWindow.mainWindow.restore()
        AppWindow.mainWindow.show()
        AppWindow.mainWindow.focus()
      }
    })
  }

  handleAppWillQuit() {
    registerAppShutdown()
    onAppShutdown(() => this.motrixApp?.quit())
    onAppShutdown(() => {
      if (AppWindow.appTray) {
        AppWindow.appTray.destroy()
        AppWindow.appTray = undefined
      }
    })
  }

  handleAppWindowAllClosed() {
    app.on('window-all-closed', () => {
      if (is.macOS()) {
        AppWindow.appTray?.destroy()
      } else {
        app.quit()
      }
    })
  }
}
