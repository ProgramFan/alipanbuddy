import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { AriaCalls } from '../aria2Rpc'

const { ariaCall, ariaMulticall, FakeAria2Client } = vi.hoisted(() => {
  const ariaCall = vi.fn(async (_call: unknown): Promise<any> => undefined)
  const ariaMulticall = vi.fn(async (_calls: unknown[]): Promise<any[]> => [])

  class FakeAria2Client {
    host = '127.0.0.1'
    on() {
      return this
    }
    setMaxListeners() {
      return this
    }
    open() {
      return Promise.resolve()
    }
    close() {
      return Promise.resolve()
    }
    call(call: unknown) {
      return ariaCall(call)
    }
    multicall(calls: unknown[]) {
      return ariaMulticall(calls)
    }
  }

  return { ariaCall, ariaMulticall, FakeAria2Client }
})

vi.mock('../aria2Rpc', async () => {
  const actual = await vi.importActual<typeof import('../aria2Rpc')>('../aria2Rpc')
  return { ...actual, Aria2Client: FakeAria2Client }
})

vi.mock('../../tauri/app', async () => {
  const actual = await vi.importActual<typeof import('../../tauri/app')>('../../tauri/app')
  return { ...actual, restartAria: vi.fn(async () => 16800) }
})

vi.mock('../../utils/format', async () => {
  const actual = await vi.importActual<typeof import('../../utils/format')>('../../utils/format')
  return { ...actual, Sleep: async () => {} }
})

beforeEach(() => {
  setActivePinia(createPinia())
  ariaCall.mockClear()
  ariaMulticall.mockClear()
})

describe('aria2 task operations', () => {
  it('pauses tasks with one forcePause call per gid', async () => {
    const { AriaStopList } = await import('../aria2c')

    await AriaStopList(['g1', 'g2'])

    expect(ariaMulticall).toHaveBeenCalledWith([AriaCalls.forcePause('g1'), AriaCalls.forcePause('g2')])
  })

  it('resumes tasks with one unpause call per gid', async () => {
    const { AriaStartList } = await import('../aria2c')

    await AriaStartList(['g1', 'g2'])

    expect(ariaMulticall).toHaveBeenCalledWith([AriaCalls.unpause('g1'), AriaCalls.unpause('g2')])
  })

  it('removes tasks and their download results', async () => {
    const { AriaDeleteList } = await import('../aria2c')

    await AriaDeleteList(['g1'])

    expect(ariaMulticall).toHaveBeenCalledWith([AriaCalls.forceRemove('g1'), AriaCalls.removeDownloadResult('g1')])
  })

  it('skips empty gids and does not talk to aria2 for an empty list', async () => {
    const { AriaStopList } = await import('../aria2c')

    await AriaStopList(['', ''])

    expect(ariaMulticall).not.toHaveBeenCalled()
  })

  it('normalizes the task status answered by tellStatus', async () => {
    const { AriaGetTaskStatus } = await import('../aria2c')
    ariaCall.mockResolvedValueOnce({ gid: 'g1', status: 'active', totalLength: '2048', completedLength: '1024', numSeeders: '2', seeder: 'true', files: [] })

    const task = await AriaGetTaskStatus('g1')

    expect(ariaCall).toHaveBeenLastCalledWith(expect.objectContaining({ method: AriaCalls.tellStatus('g1', []).method }))
    expect(task).toMatchObject({ gid: 'g1', status: 'active', totalLength: 2048, completedLength: 1024, numSeeders: 2, seeder: true })
  })

  it('normalizes the file list answered by getFiles', async () => {
    const { AriaGetTaskFiles } = await import('../aria2c')
    ariaCall.mockResolvedValueOnce([{ index: '1', path: '/tmp/a.mkv', length: '100', completedLength: '50', selected: 'true' }])

    const files = await AriaGetTaskFiles('g1')

    expect(ariaCall).toHaveBeenLastCalledWith(AriaCalls.getFiles('g1'))
    expect(files).toEqual([{ index: 1, path: '/tmp/a.mkv', name: 'a.mkv', length: 100, completedLength: 50, selected: true }])
  })

  it('answers null and an empty file list when aria2 rejects', async () => {
    const { AriaGetTaskFiles, AriaGetTaskStatus } = await import('../aria2c')
    ariaCall.mockRejectedValueOnce(new Error('connection closed'))
    expect(await AriaGetTaskStatus('g1')).toBeNull()
    ariaCall.mockRejectedValueOnce(new Error('connection closed'))
    expect(await AriaGetTaskFiles('g1')).toEqual([])
  })
})
