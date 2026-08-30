/**
 * Synchronous, dependency-free subset of Node's `path` module for the renderer.
 * Separator handling follows the platform reported by the Tauri backend (`window.platform`).
 */

function isWindows(): boolean {
  return typeof window !== 'undefined' && (window as any).platform === 'win32'
}

function splitSegments(p: string): string[] {
  return p.split(/[\\/]+/)
}

function normalizeSegments(segments: string[], keepDots = false): string[] {
  const out: string[] = []
  for (const seg of segments) {
    if (!seg || seg === '.') continue
    if (seg === '..') {
      if (out.length && out[out.length - 1] !== '..') out.pop()
      else if (keepDots) out.push('..')
      continue
    }
    out.push(seg)
  }
  return out
}

function rootOf(p: string): string {
  if (isWindows()) {
    const m = p.match(/^([a-zA-Z]:)?([\\/]{1,2})?/)
    if (!m) return ''
    if (m[1] && m[2]) return m[1] + '\\'
    if (m[1]) return m[1]
    if (m[2]) return m[2].length === 2 ? '\\\\' : '\\'
    return ''
  }
  return p.startsWith('/') ? '/' : ''
}

const path = {
  get sep(): string {
    return isWindows() ? '\\' : '/'
  },

  get delimiter(): string {
    return isWindows() ? ';' : ':'
  },

  isAbsolute(p: string): boolean {
    return rootOf(p) !== '' && (isWindows() ? /^([a-zA-Z]:)?[\\/]/.test(p) : p.startsWith('/'))
  },

  normalize(p: string): string {
    if (!p) return '.'
    const sep = path.sep
    const root = rootOf(p)
    const rest = p.substring(root.length)
    const trailing = /[\\/]$/.test(p)
    const segs = normalizeSegments(splitSegments(rest), !root)
    let result = root + segs.join(sep)
    if (!result) result = '.'
    if (trailing && !/[\\/]$/.test(result)) result += sep
    return result
  },

  join(...parts: string[]): string {
    const filtered = parts.filter((v) => typeof v === 'string' && v.length > 0)
    if (!filtered.length) return '.'
    return path.normalize(filtered.join(path.sep))
  },

  resolve(...parts: string[]): string {
    let resolved = ''
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]
      if (!p) continue
      resolved = resolved ? path.join(p, resolved) : p
      if (path.isAbsolute(p)) break
    }
    return path.normalize(resolved || '.')
  },

  dirname(p: string): string {
    if (!p) return '.'
    const root = rootOf(p)
    const stripped = p.replace(/[\\/]+$/, '')
    if (stripped.length <= root.length) return root || '.'
    const idx = Math.max(stripped.lastIndexOf('/'), stripped.lastIndexOf('\\'))
    if (idx < 0) return '.'
    if (idx < root.length) return root
    const dir = stripped.substring(0, idx)
    return dir || root || path.sep
  },

  basename(p: string, ext?: string): string {
    if (!p) return ''
    const stripped = p.replace(/[\\/]+$/, '')
    const idx = Math.max(stripped.lastIndexOf('/'), stripped.lastIndexOf('\\'))
    let base = idx >= 0 ? stripped.substring(idx + 1) : stripped
    if (ext && base !== ext && base.endsWith(ext)) base = base.substring(0, base.length - ext.length)
    return base
  },

  extname(p: string): string {
    const base = path.basename(p)
    const idx = base.lastIndexOf('.')
    if (idx <= 0) return ''
    return base.substring(idx)
  },

  parse(p: string): { root: string; dir: string; base: string; ext: string; name: string } {
    const root = rootOf(p)
    const base = path.basename(p)
    const ext = path.extname(p)
    const dir = path.dirname(p)
    return { root, dir: dir === '.' && !p.includes('/') && !p.includes('\\') ? '' : dir, base, ext, name: ext ? base.substring(0, base.length - ext.length) : base }
  }
}

export default path
