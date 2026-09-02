import type { Buffer as BufferType } from 'buffer'

declare global {
  // The `buffer` npm package is installed on `window` by src/main.ts so legacy code keeps working.
  type Buffer = BufferType
  const Buffer: typeof BufferType

  // eslint-disable-next-line no-unused-vars
  interface Window {
    /** main ↔ upload worker messaging, installed by src/tauri/bridge.ts */
    WinMsg: any
    WinMsgToUpload: any
    WinMsgToMain: any
    postdataFunc: any
  }
}
