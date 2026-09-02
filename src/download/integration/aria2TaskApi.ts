import { AriaRawCall, AriaConnect } from '../aria2c'
import { normalizeAriaTask, normalizeTaskFiles } from './taskTypes'
import type { DownloadTask, DownloadTaskFile } from './taskTypes'

const TASK_FIELDS = [
  'gid', 'status', 'totalLength', 'completedLength', 'uploadLength',
  'downloadSpeed', 'uploadSpeed', 'numSeeders', 'seeder', 'connections',
  'numPieces', 'pieceLength', 'errorCode', 'errorMessage', 'dir',
  'files', 'bittorrent', 'followedBy', 'verifiedLength', 'verifyIntegrityPending'
] as const

export const normalizeTaskListResult = (tasks: any[] = []): DownloadTask[] =>
  tasks.map((task) => normalizeAriaTask(task))

export async function getTaskStatus(gid: string): Promise<DownloadTask | null> {
  try {
    await AriaConnect()
    const task = await AriaRawCall('aria2.tellStatus', gid, [...TASK_FIELDS])
    return normalizeAriaTask(task)
  } catch {
    return null
  }
}

export async function getTaskFiles(gid: string): Promise<DownloadTaskFile[]> {
  try {
    await AriaConnect()
    return normalizeTaskFiles(await AriaRawCall('aria2.getFiles', gid))
  } catch {
    return []
  }
}

async function pauseTask(gid: string): Promise<void> {
  try {
    await AriaConnect()
    await AriaRawCall('aria2.forcePause', gid)
  } catch {}
}

async function resumeTask(gid: string): Promise<void> {
  try {
    await AriaConnect()
    await AriaRawCall('aria2.unpause', gid)
  } catch {}
}

async function removeTask(gid: string): Promise<void> {
  try {
    await AriaConnect()
    await AriaRawCall('aria2.forceRemove', gid)
    await AriaRawCall('aria2.removeDownloadResult', gid)
  } catch {}
}

export async function batchPauseTasks(gids: string[]): Promise<void> {
  await Promise.all(gids.filter(Boolean).map((gid) => pauseTask(gid)))
}

export async function batchResumeTasks(gids: string[]): Promise<void> {
  await Promise.all(gids.filter(Boolean).map((gid) => resumeTask(gid)))
}

export async function batchRemoveTasks(gids: string[]): Promise<void> {
  await Promise.all(gids.filter(Boolean).map((gid) => removeTask(gid)))
}
