import { describe, expect, it } from 'vitest'
import { buildAriaAddOptions } from './aria2AddOptions'

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
