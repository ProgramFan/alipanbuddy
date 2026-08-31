#!/usr/bin/env node
// Copies the bundled aria2c binaries from static/engine into src-tauri/binaries using the
// `<name>-<rust target triple>` naming scheme that Tauri's `externalBin` expects.
import { copyFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const outDir = path.join(root, 'src-tauri', 'binaries')

const map = {
  'x86_64-unknown-linux-gnu': 'linux/x64/aria2c',
  'aarch64-unknown-linux-gnu': 'linux/arm64/aria2c',
  'x86_64-apple-darwin': 'darwin/x64/aria2c',
  'aarch64-apple-darwin': 'darwin/arm64/aria2c',
  'x86_64-pc-windows-msvc': 'win32/x64/aria2c.exe',
  'aarch64-pc-windows-msvc': 'win32/arm64/aria2c.exe'
}

function hostTriple() {
  if (process.env.TAURI_ENV_TARGET_TRIPLE) return process.env.TAURI_ENV_TARGET_TRIPLE
  try {
    const out = execSync('rustc -vV', { encoding: 'utf8' })
    const m = out.match(/host:\s*(\S+)/)
    if (m) return m[1]
  } catch {}
  return ''
}

const requested = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const all = process.argv.includes('--all')
const triples = all ? Object.keys(map) : requested.length ? requested : [hostTriple()].filter(Boolean)
if (!triples.length) {
  console.error('prepare-sidecars: could not determine target triple (pass it as an argument)')
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })
for (const triple of triples) {
  const rel = map[triple]
  if (!rel) {
    console.warn(`prepare-sidecars: no aria2c binary for ${triple}, skipping`)
    continue
  }
  const src = path.join(root, 'static', 'engine', rel)
  if (!existsSync(src)) {
    console.warn(`prepare-sidecars: missing ${src}`)
    continue
  }
  const ext = triple.includes('windows') ? '.exe' : ''
  const dest = path.join(outDir, `aria2c-${triple}${ext}`)
  copyFileSync(src, dest)
  if (!ext) chmodSync(dest, 0o755)
  console.log(`prepare-sidecars: ${rel} -> ${path.relative(root, dest)}`)
}
