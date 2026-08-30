/** Thin wrappers around the Rust upload commands (`upload_part`, `upload_cancel`, `set_upload_speed_limit`). */
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from './invoke'
import type { FlowEncAlg } from './flowenc'

export interface UploadEncryption {
  alg: FlowEncAlg
  password: string
  fileSize: number
}

export interface UploadPartRequest {
  taskId: number
  path: string
  /** absolute file offset of the first byte to send */
  start: number
  /** number of bytes to send */
  size: number
  url: string
  /** full `Authorization` header value */
  authorization: string
  encryption: UploadEncryption | null
}

export interface UploadPartResult {
  status: number
  body: string
}

export interface UploadProgress {
  taskId: number
  /** absolute file offset handed to the network so far */
  pos: number
  /** bytes handed to the network since the previous event */
  delta: number
}

type ProgressHandler = (progress: UploadProgress) => void

const progressHandlers = new Map<number, ProgressHandler>()
let progressListener: Promise<UnlistenFn> | undefined

/** Subscribes to `upload-progress` once for the whole module and dispatches by taskId. */
function ensureProgressListener(): Promise<UnlistenFn> {
  if (!progressListener) {
    progressListener = listen<UploadProgress>('upload-progress', (event) => {
      const payload = event.payload
      if (!payload) return
      const handler = progressHandlers.get(payload.taskId)
      if (handler) handler(payload)
    }).catch((err) => {
      progressListener = undefined
      throw err
    })
  }
  return progressListener
}

/** Streams the byte range [start, start + size) of `path` to `url` with a PUT request (encrypting on the fly when requested). */
export async function uploadPart(req: UploadPartRequest, onProgress?: ProgressHandler): Promise<UploadPartResult> {
  if (onProgress) {
    await ensureProgressListener()
    progressHandlers.set(req.taskId, onProgress)
  }
  try {
    return await invoke<UploadPartResult>('upload_part', {
      taskId: req.taskId,
      path: req.path,
      start: req.start,
      size: req.size,
      url: req.url,
      authorization: req.authorization,
      encryption: req.encryption || null
    })
  } finally {
    if (onProgress && progressHandlers.get(req.taskId) === onProgress) progressHandlers.delete(req.taskId)
  }
}

/** Aborts the running `uploadPart` of this task (its promise rejects). */
export function uploadCancel(taskId: number): Promise<void> {
  return invoke<void>('upload_cancel', { taskId }).catch(() => {})
}

/** Global upload speed limit in bytes per second; 0 = unlimited. */
export function setUploadSpeedLimit(bytesPerSecond: number): Promise<void> {
  const limit = Number.isFinite(bytesPerSecond) && bytesPerSecond > 0 ? Math.floor(bytesPerSecond) : 0
  return invoke<void>('set_upload_speed_limit', { bytesPerSecond: limit })
}
