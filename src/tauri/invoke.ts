import { invoke as tauriInvoke, type InvokeArgs } from '@tauri-apps/api/core'

/** `invoke` wrapper that turns the backend's `{ code, message }` rejections into real `Error`s. */
export async function invoke<T = any>(cmd: string, args?: InvokeArgs): Promise<T> {
  try {
    return await tauriInvoke<T>(cmd, args)
  } catch (err: any) {
    if (err && typeof err === 'object' && 'message' in err) {
      const error: any = new Error(String(err.message || err.code || 'invoke failed'))
      if (err.code) error.code = err.code
      throw error
    }
    if (err instanceof Error) throw err
    throw new Error(typeof err === 'string' ? err : JSON.stringify(err))
  }
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__
}
