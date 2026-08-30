/**
 * WinMsg payload codec. Electron moved worker <-> main messages over MessagePorts (structured clone),
 * Tauri events are JSON: a `Map`/`Set` (e.g. `IDriverModel.DirChildrenMap`) would arrive as `{}`.
 * Objects are only copied on the paths that actually contain a Map/Set.
 */
const MAP_KEY = '$$WinMsgMap'
const SET_KEY = '$$WinMsgSet'

function isPlainObject(value: any): boolean {
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

export function encodeWinMsg(value: any): any {
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Map) return { [MAP_KEY]: Array.from(value, ([k, v]) => [encodeWinMsg(k), encodeWinMsg(v)]) }
  if (value instanceof Set) return { [SET_KEY]: Array.from(value, encodeWinMsg) }
  if (Array.isArray(value)) {
    let copy: any[] | null = null
    for (let i = 0; i < value.length; i++) {
      const item = encodeWinMsg(value[i])
      if (item !== value[i]) {
        if (!copy) copy = value.slice()
        copy[i] = item
      }
    }
    return copy || value
  }
  if (!isPlainObject(value)) return value
  let copy: Record<string, any> | null = null
  for (const key of Object.keys(value)) {
    const item = encodeWinMsg(value[key])
    if (item !== value[key]) {
      if (!copy) copy = { ...value } as Record<string, any>
      copy[key] = item
    }
  }
  return copy || value
}

export function decodeWinMsg(value: any): any {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) {
    let copy: any[] | null = null
    for (let i = 0; i < value.length; i++) {
      const item = decodeWinMsg(value[i])
      if (item !== value[i]) {
        if (!copy) copy = value.slice()
        copy[i] = item
      }
    }
    return copy || value
  }
  const keys = Object.keys(value)
  if (keys.length === 1 && keys[0] === MAP_KEY && Array.isArray(value[MAP_KEY])) {
    return new Map(value[MAP_KEY].map(([k, v]: [any, any]) => [decodeWinMsg(k), decodeWinMsg(v)]))
  }
  if (keys.length === 1 && keys[0] === SET_KEY && Array.isArray(value[SET_KEY])) {
    return new Set(value[SET_KEY].map(decodeWinMsg))
  }
  let copy: Record<string, any> | null = null
  for (const key of keys) {
    const item = decodeWinMsg(value[key])
    if (item !== value[key]) {
      if (!copy) copy = { ...value } as Record<string, any>
      copy[key] = item
    }
  }
  return copy || value
}
