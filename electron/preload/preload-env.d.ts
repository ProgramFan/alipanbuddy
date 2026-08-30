/* eslint-disable no-unused-vars */
declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production'
    readonly VITE_DEV_SERVER_HOST: string
    readonly VITE_DEV_SERVER_PORT: string
  }
}
declare interface Window {
  Electron: any
  platform: any
  WebGetPathForFile: (file: File) => string
  WinMsg: any
  WebToElectron: any
  WebToWindow: any
  WebToElectronCB: any
  WebShowOpenDialogSync: any
  WebPlatformSync: any
  WebClearCookies: any
  WebClearCache: any
  WebUserToken: any
  WebSaveTheme: any
  WebReload: any
  WebRelaunch: any
  WebRelaunchAria: () => Promise<number>
  AutoUpdateGetState: () => Promise<any>
  AutoUpdateCheck: (force?: boolean) => Promise<any>
  AutoUpdateInstall: () => Promise<boolean>
  AutoUpdateOnStateChanged: (callback: (state: any) => void) => () => void
  WebSetProgressBar: any
  WebGetCookies: any
  WebOpenWindow: any
  WebShutDown: any
  WebSetProxy: any
  IsMainPage: boolean
}
