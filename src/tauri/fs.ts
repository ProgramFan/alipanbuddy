/**
 * Node-`fs`-like helpers backed by the Rust `fs_*` commands.
 * Errors carry a Node style `code` (ENOENT, EACCES, ...) for `FileSystemErrorMessage`.
 */
import { invoke } from './invoke'

export interface StatInfo {
  isFile: boolean
  isDirectory: boolean
  isSymlink: boolean
  size: number
  mtimeMs: number
  birthtimeMs: number
}

export interface DirEntryInfo {
  name: string
  isFile: boolean
  isDirectory: boolean
  isSymlink: boolean
}

function toBase64(data: Uint8Array | ArrayBuffer | string): string {
  if (typeof data === 'string') data = new TextEncoder().encode(data)
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
  return btoa(binary)
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const fs = {
  exists(path: string): Promise<boolean> {
    return invoke<boolean>('fs_exists', { path })
  },
  /** like `fs.stat` (follows symlinks) */
  stat(path: string): Promise<StatInfo> {
    return invoke<StatInfo>('fs_stat', { path, follow: true })
  },
  /** like `fs.lstat` */
  lstat(path: string): Promise<StatInfo> {
    return invoke<StatInfo>('fs_stat', { path, follow: false })
  },
  readDir(path: string): Promise<DirEntryInfo[]> {
    return invoke<DirEntryInfo[]>('fs_read_dir', { path })
  },
  mkdir(path: string, options: { recursive?: boolean } = {}): Promise<void> {
    return invoke('fs_mkdir', { path, recursive: options.recursive !== false })
  },
  /** like `fs.rm` */
  rm(path: string, options: { recursive?: boolean; force?: boolean } = {}): Promise<void> {
    return invoke('fs_remove', { path, recursive: !!options.recursive, force: !!options.force })
  },
  rename(from: string, to: string): Promise<void> {
    return invoke('fs_rename', { from, to })
  },
  readTextFile(path: string): Promise<string> {
    return invoke<string>('fs_read_text', { path })
  },
  writeTextFile(path: string, data: string): Promise<void> {
    return invoke('fs_write_text', { path, data })
  },
  writeFile(path: string, data: Uint8Array | ArrayBuffer | string): Promise<void> {
    return invoke('fs_write_bytes', { path, base64: toBase64(data) })
  },
  async readRange(path: string, start: number, length: number): Promise<Uint8Array> {
    return fromBase64(await invoke<string>('fs_read_range', { path, start, length }))
  }
}

export default fs
export { toBase64, fromBase64 }
