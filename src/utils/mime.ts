/** Browser-safe replacement for `mime-types#lookup` built on the `mime-db` dataset. */
import db from 'mime-db'

let extMap: Map<string, string> | undefined

const sourcePriority: Record<string, number> = { nginx: 1, apache: 2, undefined: 3, iana: 4 }

function buildMap(): Map<string, string> {
  const map = new Map<string, { type: string; score: number }>()
  for (const [type, entry] of Object.entries(db)) {
    const exts = entry.extensions || []
    if (!exts.length) continue
    const score = (sourcePriority[String(entry.source)] || 3) + (type.substring(0, 12) === 'application/' ? 0 : 0.5)
    for (const ext of exts) {
      const prev = map.get(ext)
      if (!prev || prev.score < score) map.set(ext, { type, score })
    }
  }
  const out = new Map<string, string>()
  for (const [ext, v] of map) out.set(ext, v.type)
  return out
}

/** Returns the mime type for a file name / extension (with or without leading dot), or `false`. */
function lookup(pathOrExt: string): string | false {
  if (!pathOrExt || typeof pathOrExt !== 'string') return false
  if (!extMap) extMap = buildMap()
  const base = pathOrExt.split(/[\\/]/).pop() || ''
  const dot = base.lastIndexOf('.')
  const ext = (dot >= 0 ? base.substring(dot + 1) : base).toLowerCase()
  if (!ext) return false
  return extMap.get(ext) || false
}

export default { lookup }
