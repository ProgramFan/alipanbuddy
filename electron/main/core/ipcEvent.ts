import { AppWindow, createElectronWindow } from './window'
import path from 'path'
import is from 'electron-is'
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, powerSaveBlocker, session } from 'electron'
import { writeFileSync } from 'fs'
import { exec } from 'child_process'
import { getUserDataPath } from '../utils/mainfile'
import { getMotrixApplicationRpcPort } from '../aria/runtime'

let psbId: any

export default class ipcEvent {
  private constructor() {
  }

  static handleEvents() {
    this.handleWebToElectron()
    this.handleWebToElectronCB()
    this.handleShowContextMenu()
    this.handleWebShowOpenDialogSync()
    this.handleWebPlatformSync()
    this.handleWebSaveTheme()
    this.handleWebClearCookies()
    this.handleWebGetCookies()
    this.handleWebClearCache()
    this.handleWebReload()
    this.handleWebRelaunch()
    this.handleWebRelaunchAria()
    this.handleWebSetProgressBar()
    this.handleWebShutDown()
    this.handleWebSetProxy()
    this.handleWebOpenWindow()
  }

  private static handleWebToElectron() {
    ipcMain.on('WebToElectron', async (event, data) => {
      let mainWindow = AppWindow.mainWindow
      if (data.cmd && data.cmd === 'close') {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide()
      } else if (data.cmd && data.cmd === 'relaunch') {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.destroy()
          mainWindow = undefined
        }
        try {
          app.relaunch({ args: process.argv.slice(1).concat(['--relaunch']) })
          app.exit(0)
        } catch {
        }
      } else if (data.cmd && data.cmd === 'exit') {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.destroy()
          mainWindow = undefined
        }
        try {
          app.exit(0)
        } catch {
        }
      } else if (data.cmd && data.cmd === 'minsize') {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize()
      } else if (data.cmd && data.cmd === 'maxsize') {
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isMaximized()) {
            mainWindow.unmaximize()
          } else {
            mainWindow.maximize()
          }
        }
      } else if (data.cmd && (Object.hasOwn(data.cmd, 'launchStart')
        || Object.hasOwn(data.cmd, 'launchStartShow'))) {
        const launchStart = data.cmd.launchStart
        const launchStartShow = data.cmd.launchStartShow
        const appName = path.basename(process.execPath)
        // 设置开机自启
        const settings: Electron.Settings = {
          openAtLogin: launchStart,
          path: process.execPath
        }
        // 显示主窗口
        if (is.macOS()) {
          settings.openAsHidden = !launchStartShow
        } else {
          settings.args = [
            '--processStart', `${appName}`,
            '--process-start-args', `"--hidden"`
          ]
          !launchStartShow && settings.args.push('--openAsHidden')
        }
        app.setLoginItemSettings(settings)
      } else if (data.cmd && data.cmd === 'preventSleep') {
        if (data.flag) {
          if (psbId && powerSaveBlocker.isStarted(psbId)) {
            return
          }
          psbId = powerSaveBlocker.start('prevent-app-suspension')
        } else {
          if (typeof psbId === 'undefined' || !powerSaveBlocker.isStarted(psbId)) {
            return
          }
          powerSaveBlocker.stop(psbId)
          psbId = undefined
        }
      } else if (data.cmd && data.cmd === 'downloadProgress') {
        const win = AppWindow.mainWindow
        if (win && !win.isDestroyed()) {
          const progress = typeof data.progress === 'number' ? data.progress : -1
          win.setProgressBar(progress)
        }
      } else if (data.cmd && data.cmd === 'downloadCompleted' && data.showNotification !== false) {
        const { Notification } = require('electron') as typeof import('electron')
        if (Notification.isSupported()) {
          const n = new Notification({
            title: '下载完成',
            body: data.fileName ? `${data.fileName} 已下载完成` : '文件下载完成'
          })
          n.on('click', () => { AppWindow.mainWindow?.show(); AppWindow.mainWindow?.focus() })
          n.show()
        }
      } else {
        event.sender.send('ElectronToWeb', 'mainsenddata')
      }
    })
  }

  private static handleWebToElectronCB() {
    ipcMain.on('WebToElectronCB', (event, data) => {
      const mainWindow = AppWindow.mainWindow
      if (data.cmd && data.cmd === 'maxsize') {
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isMaximized()) {
            mainWindow.unmaximize()
            event.returnValue = 'unmaximize'
          } else {
            mainWindow.maximize()
            event.returnValue = 'maximize'
          }
        }
      } else {
        event.returnValue = 'backdata'
      }
    })
  }

  private static handleShowContextMenu() {
    ipcMain.on('show-context-menu', (event, params) => {
      const { showCut, showCopy, showPaste } = params
      const window = BrowserWindow.fromWebContents(event.sender)
      // 制作右键菜单
      let template: Array<Electron.MenuItemConstructorOptions> = [
        // 设置选项是否可见
        { role: 'selectAll', label: '全选' },
        { role: 'copy', label: '复制', visible: showCopy },
        { role: 'cut', label: '剪切', visible: showCut },
        { role: 'paste', label: '粘贴', visible: showPaste },
        { role: 'undo', label: '撤销' }
      ]
      // 显示菜单
      const contextMenu = Menu.buildFromTemplate(template)
      contextMenu.popup({ window })
    })
  }

  private static handleWebShowOpenDialogSync() {
    ipcMain.on('WebShowOpenDialogSync', (event, config) => {
      const window = BrowserWindow.fromWebContents(event.sender) || AppWindow.mainWindow
      event.returnValue = dialog.showOpenDialogSync(window!, config) || []
    })
  }

  private static handleWebPlatformSync() {
    ipcMain.on('WebPlatformSync', (event) => {
      const asarPath = app.getAppPath()
      const appPath = app.getPath('userData')
      event.returnValue = {
        platform: process.platform,
        arch: process.arch,
        version: process.version,
        appVersion: app.getVersion(),
        execPath: process.execPath,
        appPath: appPath,
        asarPath: asarPath,
        argv0: process.argv0
      }
    })
  }

  private static handleWebSaveTheme() {
    ipcMain.on('WebSaveTheme', (event, data) => {
      try {
        const themeJson = getUserDataPath('theme.json')
        writeFileSync(themeJson, `{"theme":"${data.theme || ''}"}`, 'utf-8')
        const message = { theme: data.theme || 'system', dark: nativeTheme.shouldUseDarkColors }
        for (const win of AppWindow.previewWindows) {
          if (!win.isDestroyed()) win.webContents.send('setTheme', message)
        }
      } catch {
      }
    })
  }

  private static handleWebClearCookies() {
    ipcMain.on('WebClearCookies', (event, data) => {
      session.defaultSession.clearStorageData(data)
    })
  }

  private static handleWebGetCookies() {
    ipcMain.handle('WebGetCookies', async (event, data) => {
      return await session.defaultSession.cookies.get(data)
    })
  }

  private static handleWebClearCache() {
    ipcMain.on('WebClearCache', (event, data) => {
      if (data.cache) {
        session.defaultSession.clearCache()
        session.defaultSession.clearAuthCache()
      } else {
        session.defaultSession.clearStorageData(data)
      }
    })
  }

  private static handleWebReload() {
    ipcMain.on('WebReload', (event, data) => {
      if (AppWindow.mainWindow && !AppWindow.mainWindow.isDestroyed()) AppWindow.mainWindow.reload()
    })
  }

  private static handleWebRelaunch() {
    ipcMain.on('WebRelaunch', (event, data) => {
      app.relaunch()
      try {
        app.exit()
      } catch {
      }
    })
  }

  private static handleWebRelaunchAria() {
    ipcMain.handle('WebRelaunchAria', async (event, data) => {
      return getMotrixApplicationRpcPort()
    })
  }

  private static handleWebSetProgressBar() {
    ipcMain.on('WebSetProgressBar', (event, data) => {
      if (AppWindow.mainWindow && !AppWindow.mainWindow.isDestroyed()) {
        if (data.pro) {

          AppWindow.mainWindow.setProgressBar(data.pro, { mode: data.mode || 'normal' })
        } else AppWindow.mainWindow.setProgressBar(-1)
      }
    })
  }

  private static handleWebShutDown() {
    ipcMain.on('WebShutDown', (event, data) => {
      if (is.macOS()) {
        const shutdownCmd = 'osascript -e \'tell application "System Events" to shut down\''
        exec(shutdownCmd, (err: any) => {
          if (data.quitApp) {
            try {
              app.exit()
            } catch {
            }
          }
          if (err) {
            // donothing
          }
        })
      } else {
        const cmdArguments = ['shutdown']
        if (is.linux()) {
          if (data.sudo) {
            cmdArguments.unshift('sudo')
          }
          cmdArguments.push('-h')
          cmdArguments.push('now')
        }
        if (is.windows()) {
          cmdArguments.push('-s')
          cmdArguments.push('-f')
          cmdArguments.push('-t 0')
        }

        const finalcmd = cmdArguments.join(' ')

        exec(finalcmd, (err: any) => {
          if (data.quitApp) {
            try {
              app.exit()
            } catch {
            }
          }
          if (err) {
            // donothing
          }
        })
      }
    })
  }

  private static handleWebSetProxy() {
    ipcMain.on('WebSetProxy', (event, data) => {
      console.log(JSON.stringify(data))
      if (data.proxyUrl) {
        session.defaultSession.setProxy({ proxyRules: data.proxyUrl })
      } else {
        session.defaultSession.setProxy({})
      }
    })
  }

  private static handleWebOpenWindow() {
    let winWidth = AppWindow.winWidth
    if (winWidth < 1080) winWidth = 1080
    ipcMain.on('WebOpenWindow', (event, data) => {
      const win = createElectronWindow(winWidth, AppWindow.winHeight, true, 'main2', data.theme)
      AppWindow.previewWindows.add(win)
      win.once('closed', () => AppWindow.previewWindows.delete(win))
      win.on('ready-to-show', function() {
        win.webContents.send('setPage', data)
        win.webContents.send('setTheme', { dark: nativeTheme.shouldUseDarkColors })
        win.setTitle('预览窗口')
        win.show()
      })
    })
  }
}
