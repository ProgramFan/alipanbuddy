/** Thin wrappers around the Rust file hashing commands (`file_prehash`, `file_sha1`). */
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from './invoke'

export interface Sha1Progress {
  taskId: number
  /** bytes hashed so far */
  readlen: number
  /** total file size */
  size: number
}

export interface FileSha1Result {
  /** UPPERCASE hex sha1 of the whole file */
  sha1: string
  /** base64 proof code derived from the access token */
  proofCode: string
}

export interface FileSha1Request {
  taskId: number
  path: string
  accessToken: string
  onProgress?: (progress: Sha1Progress) => void
}

/** UPPERCASE hex sha1 of the first 1024 bytes (zero padded). */
export function filePrehash(path: string): Promise<string> {
  return invoke<string>('file_prehash', { path })
}

/** Hashes the whole file; `onProgress` receives the `sha1-progress` events of this task while the command runs. */
export async function fileSha1(req: FileSha1Request): Promise<FileSha1Result> {
  let unlisten: UnlistenFn | undefined
  const onProgress = req.onProgress
  if (onProgress) {
    unlisten = await listen<Sha1Progress>('sha1-progress', (event) => {
      const payload = event.payload
      if (payload && payload.taskId === req.taskId) onProgress(payload)
    })
  }
  try {
    return await invoke<FileSha1Result>('file_sha1', { taskId: req.taskId, path: req.path, accessToken: req.accessToken })
  } finally {
    if (unlisten) unlisten()
  }
}

/** Aborts a running `fileSha1` (its promise rejects). */
export function fileSha1Cancel(taskId: number): Promise<void> {
  return invoke<void>('file_sha1_cancel', { taskId }).catch(() => {})
}
