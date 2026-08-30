/**
 * Tauri delivers OS file drops as window events with real paths (`tauri://drag-drop`);
 * the HTML5 `DataTransfer.files` objects no longer expose a local path.
 * This forwards drops to the pan page which decides the upload target.
 */
import { getCurrentWebview } from '@tauri-apps/api/webview'

export type DropHandler = (paths: string[], position: { x: number; y: number }) => void

let handler: DropHandler | undefined
let installed = false

export function setDropHandler(fn: DropHandler | undefined) {
  handler = fn
}

export function installDragDropUpload() {
  if (installed) return
  installed = true
  getCurrentWebview()
    .onDragDropEvent((event) => {
      const payload: any = event.payload
      if (!payload || payload.type !== 'drop') return
      const paths: string[] = Array.isArray(payload.paths) ? payload.paths : []
      if (!paths.length || !handler) return
      const scale = window.devicePixelRatio || 1
      const position = payload.position ? { x: payload.position.x / scale, y: payload.position.y / scale } : { x: 0, y: 0 }
      handler(paths, position)
    })
    .catch(() => {})
}
