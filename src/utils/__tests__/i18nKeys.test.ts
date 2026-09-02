import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(__dirname, '../../..')
const i18nFile = path.join('src', 'i18n', 'index.ts')

/** Evaluates the `messages` object literal of src/i18n/index.ts — the same literal `t()` derives its key type from. */
function readMessages(): Record<string, Record<string, string>> {
  const source = readFileSync(path.join(repoRoot, i18nFile), 'utf8')
  const head = 'const messages = '
  const start = source.indexOf(head)
  expect(start, `\`${head}\` not found in ${i18nFile}`).toBeGreaterThanOrEqual(0)
  const end = source.indexOf('} as const', start)
  expect(end, `end of the messages literal not found in ${i18nFile}`).toBeGreaterThan(start)
  const literal = source.slice(start + head.length, end + 1)
  return new Function(`return ${literal}`)()
}

/** Every file tracked under src/, minus the i18n module itself (a key may not count as used by its own declaration). */
function trackedSourceFiles(): string[] {
  const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  return listed
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((file) => path.normalize(file) !== i18nFile)
}

/**
 * Collects every key-shaped literal wrapped in matching quotes: 'key', "key" or `key`.
 * The body may not contain a quote, so a nested literal such as :placeholder="t('pan.search')"
 * is still picked up from the inner pair rather than being swallowed by the outer one.
 */
function quotedLiterals(files: string[]): Set<string> {
  const quoted = /(['"`])([\w.$-]+)\1/g
  const found = new Set<string>()
  for (const file of files) {
    let content: string
    try {
      content = readFileSync(path.join(repoRoot, file), 'utf8')
    } catch {
      continue // deleted or binary-only entries still listed by git
    }
    for (const match of content.matchAll(quoted)) found.add(match[2])
  }
  return found
}

describe('i18n message keys', () => {
  const messages = readMessages()

  it('exposes exactly the zh-CN and en-US locales', () => {
    expect(Object.keys(messages).sort()).toEqual(['en-US', 'zh-CN'])
  })

  it('keeps zh-CN and en-US on an identical key set', () => {
    const zh = Object.keys(messages['zh-CN']).sort()
    const en = Object.keys(messages['en-US']).sort()
    const missingInEn = zh.filter((key) => !messages['en-US'][key])
    const missingInZh = en.filter((key) => !messages['zh-CN'][key])
    expect(missingInEn, `keys missing from en-US:\n${missingInEn.join('\n')}`).toEqual([])
    expect(missingInZh, `keys missing from zh-CN:\n${missingInZh.join('\n')}`).toEqual([])
    expect(zh).toEqual(en)
  })

  it('references every key from at least one file outside src/i18n', () => {
    const referenced = quotedLiterals(trackedSourceFiles())
    const unreferenced = Object.keys(messages['zh-CN']).filter((key) => !referenced.has(key))
    expect(unreferenced, `${unreferenced.length} i18n key(s) are never referenced under src/ — delete them from ${i18nFile}:\n${unreferenced.join('\n')}`).toEqual([])
  })
})
