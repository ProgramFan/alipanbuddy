import Electron, { ipcRenderer, webUtils } from 'electron'

window.Electron = Electron
process.noAsar = true
window.platform = process.platform
window.WebGetPathForFile = function(file: File) {
  try {
    return webUtils.getPathForFile(file)
  } catch {
    return ''
  }
}

window.WebToElectron = function(data: any) {
  try {
    ipcRenderer.send('WebToElectron', data)
  } catch {
  }
}

window.WebToWindow = function(data: any, callback: any) {
  try {
    const backData = ipcRenderer.sendSync('WebToWindow', data)
    callback && callback(backData)
  } catch {
  }
}

window.WebToElectronCB = function(data: any, callback: any) {
  try {
    const backData = ipcRenderer.sendSync('WebToElectronCB', data)
    callback(backData)
  } catch {
  }
}

ipcRenderer.on('MainSendToken', function(event, arg) {
  try {
    window.postMessage(arg)
  } catch {
  }
})

window.WebShowOpenDialogSync = function(config: any, callback: any) {
  try {
    const backData = ipcRenderer.sendSync('WebShowOpenDialogSync', config)
    callback(backData)
  } catch {
  }
}

window.WebPlatformSync = function(callback: any) {
  try {
    const backData = ipcRenderer.sendSync('WebPlatformSync')
    callback(backData)
  } catch {
  }
}

window.WebClearCookies = function(data: any) {
  try {
    ipcRenderer.send('WebClearCookies', data)
  } catch {
  }
}
window.WebClearCache = function(data: any) {
  try {
    ipcRenderer.send('WebClearCache', data)
  } catch {
  }
}
window.WebUserToken = function(data: any) {
  try {
    ipcRenderer.send('WebUserToken', data)
  } catch {
  }
}
window.WebSaveTheme = function(data: any) {
  try {
    ipcRenderer.send('WebSaveTheme', data)
  } catch {
  }
}

window.WebReload = function(data: any) {
  try {
    ipcRenderer.send('WebReload', data)
  } catch {
  }
}
window.WebRelaunch = function(data: any) {
  try {
    ipcRenderer.send('WebRelaunch', data)
  } catch {
  }
}
window.WebRelaunchAria = async function() {
  try {
    return await ipcRenderer.invoke('WebRelaunchAria')
  } catch {
    return 0
  }
}
window.AutoUpdateGetState = async function() {
  try {
    return await ipcRenderer.invoke('AutoUpdate:GetState')
  } catch {
    return { status: 'unsupported' }
  }
}
window.AutoUpdateCheck = async function(force = false) {
  try {
    return await ipcRenderer.invoke('AutoUpdate:Check', force)
  } catch {
    return { status: 'error' }
  }
}
window.AutoUpdateInstall = async function() {
  try {
    return await ipcRenderer.invoke('AutoUpdate:Install')
  } catch {
    return false
  }
}
window.AutoUpdateOnStateChanged = function(callback: (state: any) => void) {
  const listener = (_event: Electron.IpcRendererEvent, state: any) => callback(state)
  ipcRenderer.on('AutoUpdate:StateChanged', listener)
  return () => ipcRenderer.removeListener('AutoUpdate:StateChanged', listener)
}
window.WebSetProgressBar = function(data: any) {
  try {
    ipcRenderer.send('WebSetProgressBar', data)
  } catch {
  }
}
window.WebGetCookies = async function(data: any) {
  try {
    return await ipcRenderer.invoke('WebGetCookies', data)
  } catch {
  }
}

window.WebOpenWindow = function(data: any) {
  try {
    ipcRenderer.send('WebOpenWindow', data)
  } catch {
  }
}
window.WebShutDown = function(data: any) {
  try {
    ipcRenderer.send('WebShutDown', data)
  } catch {
  }
}
window.WebSetProxy = function(data: { proxyUrl: string }) {
  try {
    ipcRenderer.send('WebSetProxy', data)
  } catch {
  }
}

function createRightMenu() {
  window.addEventListener('contextmenu', (e) => {
      if (e) e.preventDefault()
      const target = e.target as HTMLElement
      // 检查页面是否是有选择的文本 这里显示复制和剪切选项是否可见
      const selectText = !!window.getSelection().toString()
      if (selectText || isEleEditable(target)) {
        // 读取剪切板是否有文本 这里传递粘贴选项是否可见
        const showPaste = !!navigator.clipboard.readText()
        // 判断ReadOnly
        const isReadOnly = target.hasAttribute('readonly')
        // 发送给主进程让它显示菜单
        ipcRenderer.send('show-context-menu', {
          showPaste: !isReadOnly && showPaste,
          showCopy: selectText,
          showCut: !isReadOnly && selectText
        })
      }
    }
  )
}

function isEleEditable(e: any): boolean {
  if (!e) return false
  if (e.tagName === 'TEXTAREA'
    || (e.tagName === 'INPUT' && e.type !== 'checkbox')
    || e.contentEditable == 'true') {
    return true
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return isEleEditable(e.parentNode)
  }
}

createRightMenu()

// fix: new-windows event
ipcRenderer.on('webview-new-window', (e, webContentsId, details) => {
  const webview = document.getElementById('webview') as any
  const evt = new Event('new-window', { bubbles: true, cancelable: false })
  webview.dispatchEvent(Object.assign(evt, details))
})

ipcRenderer.on('webview-redirect', (e, webContentsId, url) => {
  const webview = document.getElementById('webview') as any
  const evt = new Event('will-redirect', { bubbles: true, cancelable: false })
  webview.dispatchEvent(Object.assign(evt, { url }))
})
