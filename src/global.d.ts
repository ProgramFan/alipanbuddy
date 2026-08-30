export {}

declare global {
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
    WebClearCache: any
    WebRelaunch: any
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
    UploadPort: any
    DownloadPort: any
    MainPort: any
    MainProxyServer: any
    MainProxyHost: any
    MainProxyPort: any
    WinMsgToUpload: any
    WinMsgToDownload: any
    WinMsgToMain: any
    IsMainPage: boolean
    WebSetProxy: any
    speedLimte: number
    WebSetProgressBar: any
  }
}
