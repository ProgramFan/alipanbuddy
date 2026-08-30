import type { Buffer as BufferType } from 'buffer'

declare global {
  // The `buffer` npm package is installed on `window` by src/main.ts so legacy code keeps working.
  type Buffer = BufferType
  const Buffer: typeof BufferType

  // eslint-disable-next-line no-unused-vars
  interface Window {
    Go: any
    require: any
    Electron: any
    openDatabase: any
    WebRelaunchAria: () => Promise<number>
    platform: string
    WebGetPathForFile: (file: File) => string
    WinMsg: any
    postdataFunc: any
    WebUserToken: any
    WebToElectron: any
    WebToWindow: any
    WebToElectronCB: any
    WebClearCache: any
    WebRelaunch: any
    WebReload: any
    WebGetCookies: any
    WebClearCookies: any
    WebSaveTheme: any
    WebShutDown: any
    WebOpenWindow: any
    WebShowOpenDialogSync: any
    WebPlatformSync: any
    AutoUpdateGetState?: () => Promise<any>
    AutoUpdateCheck?: (force?: boolean) => Promise<any>
    AutoUpdateInstall?: () => Promise<boolean>
    AutoUpdateOnStateChanged?: (callback: (state: any) => void) => () => void
    MainProxyServer: any
    MainProxyHost: any
    MainProxyPort: any
    WinMsgToUpload: any
    WinMsgToDownload: any
    WinMsgToMain: any
    IsMainPage: boolean
    WebSetProxy: any
    WebSetProgressBar: any
  }
}
