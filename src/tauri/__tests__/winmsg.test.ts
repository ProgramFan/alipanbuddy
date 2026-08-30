import { describe, expect, it } from 'vitest'
import { decodeWinMsg, encodeWinMsg } from '../winmsg'

describe('WinMsg codec', () => {
  it('round-trips Map and Set through JSON', () => {
    const driver = {
      drive_id: 'd1',
      DirChildrenMap: new Map<string, { file_id: string }[]>([['root', [{ file_id: 'a' }]]]),
      DirFileSizeMap: { a: 1 },
      keys: new Set(['x', 'y']),
      nested: [{ m: new Map([[1, 'one']]) }]
    }
    const wire = JSON.parse(JSON.stringify(encodeWinMsg({ cmd: 'MainSaveAllDir', OneDriver: driver })))
    const back = decodeWinMsg(wire)
    expect(back.OneDriver.DirChildrenMap).toBeInstanceOf(Map)
    expect(back.OneDriver.DirChildrenMap.get('root')).toEqual([{ file_id: 'a' }])
    expect(back.OneDriver.keys).toBeInstanceOf(Set)
    expect(back.OneDriver.keys.has('y')).toBe(true)
    expect(back.OneDriver.nested[0].m.get(1)).toBe('one')
    expect(back.OneDriver.DirFileSizeMap).toEqual({ a: 1 })
  })

  it('returns the same reference when nothing needs encoding', () => {
    const plain = { cmd: 'MainUploadEvent', ReportList: [{ UploadID: 1, Speed: 2 }], SpeedTotal: '' }
    expect(encodeWinMsg(plain)).toBe(plain)
    expect(decodeWinMsg(plain)).toBe(plain)
    expect(encodeWinMsg(null)).toBe(null)
    expect(encodeWinMsg('x')).toBe('x')
  })

  it('leaves class instances alone', () => {
    const date = new Date(0)
    const bytes = new Uint8Array([1, 2])
    const out = encodeWinMsg({ date, bytes })
    expect(out.date).toBe(date)
    expect(out.bytes).toBe(bytes)
  })
})
