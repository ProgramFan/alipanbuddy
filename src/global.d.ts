import type { Buffer as BufferType } from 'buffer'

declare global {
  // The `buffer` npm package is installed on `window` by src/main.ts so legacy code keeps working.
  type Buffer = BufferType
  const Buffer: typeof BufferType

  // eslint-disable-next-line no-unused-vars
  interface Window {
    WebRelaunchAria: () => Promise<number>
    platform: string
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
    MainProxyServer: any
    WinMsgToUpload: any
    WinMsgToMain: any
    WebSetProxy: any
    WebSetProgressBar: any
  }
}
