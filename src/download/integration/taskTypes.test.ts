import { describe, expect, it } from 'vitest'
import { normalizeAriaTask, normalizeTaskFiles } from './taskTypes'

describe('normalizeAriaTask', () => {
  it('normalizes aria2 task numbers that arrive as strings', () => {
    const task = normalizeAriaTask({
      gid: 'abc', status: 'active', totalLength: '2048',
      completedLength: '1024', downloadSpeed: '512', uploadSpeed: '128',
      numSeeders: '2', seeder: 'true', dir: '/tmp/downloads', files: []
    })
    expect(task).toMatchObject({
      gid: 'abc', status: 'active', totalLength: 2048,
      completedLength: 1024, downloadSpeed: 512, uploadSpeed: 128,
      numSeeders: 2, seeder: true
    })
  })
})

describe('normalizeTaskFiles', () => {
  it('normalizes file index, length, selected, and adds name', () => {
    const files = normalizeTaskFiles([
      { index: '1', path: '/tmp/a.mkv', length: '100', completedLength: '50', selected: 'true' },
      { index: '2', path: '/tmp/b.srt', length: '10', completedLength: '0', selected: 'false' }
    ])
    expect(files).toEqual([
      { index: 1, path: '/tmp/a.mkv', name: 'a.mkv', length: 100, completedLength: 50, selected: true },
      { index: 2, path: '/tmp/b.srt', name: 'b.srt', length: 10, completedLength: 0, selected: false }
    ])
  })
})
