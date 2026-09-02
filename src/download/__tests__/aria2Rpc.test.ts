import { describe, expect, it } from 'vitest'
import {
  AriaCalls,
  buildAriaAddOptions,
  getAriaAddUriGid,
  isAriaDuplicateGidError,
  shouldRemoveAriaStoppedResult,
  tryAriaCall
} from '../aria2Rpc'

describe('AriaCalls method wrappers', () => {
  it('builds the aria2 json-rpc method names and parameters', () => {
    expect(AriaCalls.addUri(['https://a/b.mkv'], { gid: 'g1' })).toEqual({ method: 'aria2.addUri', params: [['https://a/b.mkv'], { gid: 'g1' }] })
    expect(AriaCalls.tellStatus('g1', ['gid', 'status'])).toEqual({ method: 'aria2.tellStatus', params: ['g1', ['gid', 'status']] })
    expect(AriaCalls.tellActive(['gid'])).toEqual({ method: 'aria2.tellActive', params: [['gid']] })
    expect(AriaCalls.tellWaiting(0, 1000, ['gid'])).toEqual({ method: 'aria2.tellWaiting', params: [0, 1000, ['gid']] })
    expect(AriaCalls.tellStopped(0, 1000, ['gid'])).toEqual({ method: 'aria2.tellStopped', params: [0, 1000, ['gid']] })
    expect(AriaCalls.getFiles('g1')).toEqual({ method: 'aria2.getFiles', params: ['g1'] })
    expect(AriaCalls.forcePause('g1')).toEqual({ method: 'aria2.forcePause', params: ['g1'] })
    expect(AriaCalls.unpause('g1')).toEqual({ method: 'aria2.unpause', params: ['g1'] })
    expect(AriaCalls.forceRemove('g1')).toEqual({ method: 'aria2.forceRemove', params: ['g1'] })
    expect(AriaCalls.removeDownloadResult('g1')).toEqual({ method: 'aria2.removeDownloadResult', params: ['g1'] })
    expect(AriaCalls.changeGlobalOption({ 'seed-time': '0' })).toEqual({ method: 'aria2.changeGlobalOption', params: [{ 'seed-time': '0' }] })
    expect(AriaCalls.getGlobalStat()).toEqual({ method: 'aria2.getGlobalStat', params: [] })
    expect(AriaCalls.forceShutdown()).toEqual({ method: 'aria2.forceShutdown', params: [] })
  })

  it('copies the readonly field lists so aria2 never sees a shared array', () => {
    const fields = ['gid', 'status']
    expect(AriaCalls.tellActive(fields).params[0]).not.toBe(fields)
  })
})

describe('buildAriaAddOptions', () => {
  it('builds HTTP download options', () => {
    expect(buildAriaAddOptions({
      gid: 'g1',
      dir: '/tmp',
      split: 4,
      referer: 'https://www.aliyundrive.com/drive',
      userAgent: 'Chrome',
      headers: ['Authorization: Bearer token'],
      outFileName: 'movie.mkv'
    })).toEqual({
      gid: 'g1',
      dir: '/tmp',
      split: 4,
      out: 'movie.mkv',
      referer: 'https://www.aliyundrive.com/drive',
      'user-agent': 'Chrome',
      header: ['Authorization: Bearer token']
    })
  })

  it('omits empty referer, user agent and headers', () => {
    expect(buildAriaAddOptions({ gid: 'g1', dir: '/tmp', split: 1, referer: '', userAgent: '', headers: [], outFileName: 'a.bin' })).toEqual({ gid: 'g1', dir: '/tmp', split: 1, out: 'a.bin' })
  })
})

describe('aria2 rpc helpers', () => {
  it('extracts gid from addUri multicall result shapes', () => {
    expect(getAriaAddUriGid('0123456789abcdef')).toBe('0123456789abcdef')
    expect(getAriaAddUriGid(['0123456789abcdef'])).toBe('0123456789abcdef')
    expect(getAriaAddUriGid([['0123456789abcdef']])).toBe('0123456789abcdef')
  })

  it('does not treat empty or error addUri results as gid success', () => {
    expect(getAriaAddUriGid(undefined)).toBe('')
    expect(getAriaAddUriGid({ code: 1, message: 'failed' })).toBe('')
    expect(getAriaAddUriGid([''])).toBe('')
  })

  it('detects duplicate gid errors without requiring an exact message', () => {
    expect(isAriaDuplicateGidError({ message: 'GID 0123456789abcdef already exists' })).toBe(true)
    expect(isAriaDuplicateGidError({ message: 'gid already exists' })).toBe(true)
    expect(isAriaDuplicateGidError({ message: 'network timeout' })).toBe(false)
  })

  it('keeps paused tasks in remote aria2 instead of removing their result', () => {
    expect(shouldRemoveAriaStoppedResult('paused')).toBe(false)
    expect(shouldRemoveAriaStoppedResult('error')).toBe(true)
    expect(shouldRemoveAriaStoppedResult('removed')).toBe(true)
  })

  it('does not throw when the aria2 client is unavailable', async () => {
    const client: { call: (call: unknown) => Promise<unknown> } | undefined = undefined
    await expect(tryAriaCall(() => client!.call(AriaCalls.forcePause('g1')))).resolves.toBeUndefined()
  })

  it('captures aria2 client call errors for callers that need fallback logic', async () => {
    const error = new Error('connection closed')
    const client = {
      call: async () => {
        throw error
      }
    }
    let captured: unknown

    const result = await tryAriaCall(() => client.call(), (err: unknown) => {
      captured = err
    })

    expect(result).toBeUndefined()
    expect(captured).toBe(error)
  })
})
