import pkg from '../../package.json'


export function ArrayCopy(arr: any[]): any[] {
  const copy: any[] = []
  for (let i = 0, maxi = arr.length; i < maxi; i++) {
    copy.push(arr[i])
  }
  return copy
}


export function MapValueToArray<T>(map: Map<any, T>): T[] {
  const arr: T[] = []
  const keys = map.values()
  for (let i = 0, maxi = map.size; i < maxi; i++) {
    const value = keys.next().value
    if (value !== undefined) {
      arr.push(value)
    }
  }
  return arr
}

export function ArrayToMap<T>(keyname: string, arr: T[]) {
  const map = new Map<any, T>()
  let item: any
  for (let i = 0, maxi = arr.length; i < maxi; i++) {
    item = arr[i]
    map.set(item[keyname], item)
  }
  return map
}

export function ArrayKeyList<T>(keyname: string, arr: any[]): T[] {
  const selectkeys: T[] = []
  for (let i = 0, maxi = arr.length; i < maxi; i++) {
    selectkeys.push(arr[i][keyname])
  }
  return selectkeys
}

/** Symmetric difference of two arrays using a custom comparator (lodash `xorWith`). */
export function ArrayXorWith<T>(first: T[], second: T[], comparator: (a: T, b: T) => boolean): T[] {
  const missingFrom = (list: T[]) => (item: T) => !list.some((other) => comparator(item, other))
  return [...first.filter(missingFrom(second)), ...second.filter(missingFrom(first))]
}

/** True for null / undefined, empty strings and arrays, empty Map / Set, objects without own keys (lodash `isEmpty`). */
export function IsEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string' || Array.isArray(value)) return value.length === 0
  if (value instanceof Map || value instanceof Set) return value.size === 0
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length === 0
  return true
}


export function HanToPin(input: string): string {
  if (!input) return ''
  // eslint-disable-next-line no-undef
  const arr = pinyinlite(input, { keepUnrecognized: true })
  const strarr = new Array<string>(arr.length * 2 + 1)
  let l = false
  for (let p = 1, i = 0, maxi = arr.length; i < maxi; p += 2, i++) {
    strarr[p] = arr[i].join(' ')
    l = strarr[p].length > 1
    if (l) {
      strarr[p - 1] = ' '
      strarr[p + 1] = ' '
    } else {
      strarr[p + 1] = ''
    }
  }
  strarr[0] = ''
  return strarr.join('')
}

export function GetExpiresTime(downUrl: string) {
  let url = decodeURIComponent(downUrl)
  if (!url || !url.includes('x-oss-expires=')) return 0
  try {
    let expires = url.substring(url.indexOf('x-oss-expires=') + 'x-oss-expires='.length)
    expires = expires.substring(0, expires.indexOf('&'))
    return parseInt(expires) * 1000
  } catch {
    return 0
  }
}


export function getPkgVersion() {
  return pkg.version
}

/** Returns `port` when it is free, otherwise the next free port above it (answered by the Rust side). */

