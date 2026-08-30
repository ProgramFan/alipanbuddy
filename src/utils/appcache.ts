import { useSettingStore } from '../store'
import DebugLog from './debuglog'
import { getUserData } from './electronhelper'
import { FileSystemErrorMessage } from './filehelper'
import { humanSize, Sleep } from './format'
import message from './message'

import path from './path'
import fs, { DirEntryInfo } from '../tauri/fs'

/**
 * Lists a directory. Missing directories (e.g. the Chromium cache folders that do not exist under Tauri)
 * yield an empty list; other errors are logged when `report` is set.
 */
async function readDirSafe(dir: string, report: string): Promise<DirEntryInfo[]> {
  try {
    return await fs.readDir(dir)
  } catch (err: any) {
    if (report && err && err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
      const msg = FileSystemErrorMessage(err.code, err.message)
      DebugLog.mSaveDanger(report + '失败：' + dir, msg)
      message.error(msg + ' ' + dir)
    }
    return []
  }
}

async function fileSize(filePath: string): Promise<number> {
  return fs
    .lstat(filePath)
    .then((stat) => stat.size || 0)
    .catch(() => 0)
}

export default class AppCache {

  private static async LoadStorageSize(dir: string, inCache = false): Promise<{ total: number; cache: number }> {
    try {
      const childFiles = await readDirSafe(dir, '')
      let total = 0
      let cache = 0
      for (const child of childFiles) {
        const childPath = path.join(dir, child.name)
        if (child.isFile) {
          const size = await fileSize(childPath)
          total += size
          if (inCache) cache += size
        } else if (child.isDirectory) {
          const childSize = await AppCache.LoadStorageSize(childPath, inCache || child.name === 'Cache')
          total += childSize.total
          cache += childSize.cache
        }
      }
      return { total, cache }
    } catch {
      return { total: 0, cache: 0 }
    }
  }

  static async LoadDirSize(dir: string): Promise<number> {
    try {
      const childFiles = await readDirSafe(dir, 'LoadDirSize')
      let total = 0
      for (let i = 0, maxi = childFiles.length; i < maxi; i++) {
        if (childFiles[i].isFile) {
          total += await fileSize(path.join(dir, childFiles[i].name))
        } else if (childFiles[i].isDirectory) {
          total += await AppCache.LoadDirSize(path.join(dir, childFiles[i].name))
        }
      }
      return total
    } catch {
      return 0
    }
  }

  static async LoadCacheDirSize(dir: string): Promise<number> {
    try {
      const childFiles = await readDirSafe(dir, 'LoadCacheDirSize')
      let total = 0
      for (let i = 0, maxi = childFiles.length; i < maxi; i++) {
        if (childFiles[i].isFile) {
          total += await fileSize(path.join(dir, childFiles[i].name))
        } else if (childFiles[i].isDirectory) {
          total += await AppCache.LoadDirSize(path.join(dir, childFiles[i].name))
        }
      }
      return total
    } catch {
      return 0
    }
  }

  static DeleteDir(dir: string): Promise<void> {
    return fs
      .rm(dir, { recursive: true, force: true })
      .then(() => {})
      .catch(() => {})
  }


  static async aLoadDirSize(): Promise<void> {
    const userData = getUserData()
    if (!userData) return
    const dirSize = await AppCache.LoadDirSize(userData)
    if (dirSize > 800 * 1024 * 1024) message.warning('缓存文件夹体积较大，该去 设置 里清理了')
    useSettingStore().debugDirSize = humanSize(dirSize)
  }

  static async aLoadCacheSize(): Promise<void> {
    const userData = getUserData()
    if (!userData) return
    const cacheSize = await AppCache.LoadCacheDirSize(path.join(userData, 'Cache'))
    if (cacheSize > 800 * 1024 * 1024) message.warning('缓存文件夹体积较大，该去 设置 里清理了')
    useSettingStore().debugCacheSize = humanSize(cacheSize)
  }

  static async aLoadStorageSize(): Promise<void> {
    const userData = getUserData()
    if (!userData) return
    const { total, cache } = await AppCache.LoadStorageSize(userData)
    if (total > 800 * 1024 * 1024) message.warning('缓存文件夹体积较大，该去 设置 里清理了')
    useSettingStore().debugDirSize = humanSize(total)
    useSettingStore().debugCacheSize = humanSize(cache)
  }

  static async aClearDir(delby: string): Promise<void> {
    const dir = getUserData()
    if (delby == 'all') {
      // window.WebClearCache({ cache: true })
      if (window.WebClearCache)
        window.WebClearCache({
          storages: ['appcache', 'cookies', 'filesystem', 'shadercache', 'serviceworkers', 'cachestorage', 'indexdb', 'localstorage', 'websql'],
          quotas: ['temporary', 'persistent', 'syncable']
        })
    } else {
      // window.WebClearCache({ cache: true })
      if (window.WebClearCache)
        window.WebClearCache({
          storages: ['appcache', 'cookies', 'filesystem', 'shadercache', 'serviceworkers', 'cachestorage'],
          quotas: ['temporary', 'persistent', 'syncable']
        })
    }
    // Chromium data folders: they exist only for the old Electron builds, deleting a missing dir is a no-op
    if (delby == 'all') {
      await AppCache.DeleteDir(path.join(dir, 'databases')).catch(() => {})
      await AppCache.DeleteDir(path.join(dir, 'IndexedDB')).catch(() => {})
      await AppCache.DeleteDir(path.join(dir, 'Local Storage')).catch(() => {})
      await AppCache.DeleteDir(path.join(dir, 'Session Storage')).catch(() => {})
    } else if (delby == 'db') {
      await AppCache.DeleteDir(path.join(dir, 'databases')).catch(() => {})
    }
    await AppCache.DeleteDir(path.join(dir, 'Code Cache', 'js')).catch(() => {})
    await AppCache.DeleteDir(path.join(dir, 'Code Cache', 'wasm')).catch(() => {})

    await Sleep(4000)


    if (delby == 'all') {
      message.success('删除全部数据成功，自动重启神行云盘助手')
      Sleep(3000).then(() => {
        window.WebRelaunch()
      })
    } else if (delby == 'db') {
      message.success('删除数据库成功，自动重启神行云盘助手')
      Sleep(3000).then(() => {
        window.WebRelaunch()
      })
    } else {
      message.success('清理缓存成功，自动重启神行云盘助手')
      Sleep(3000).then(() => {
        // window.WebReload()
        window.WebRelaunch()
      })
    }
  }

  static async aClearCache(): Promise<void> {
    const dir = getUserData()
    await AppCache.DeleteDir(path.join(dir, 'Cache')).catch(() => {})
    message.success('删除全部缓存数据成功，自动重启神行云盘助手')
    Sleep(1500).then(() => {
      window.WebRelaunch()
    })
  }
}
