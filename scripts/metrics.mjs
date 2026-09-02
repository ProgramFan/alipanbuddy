// Prints the size numbers tracked in release notes: dependency count, source lines, tracked binaries.
// Usage: pnpm run metrics
import { execSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'

const sh = (cmd) => execSync(cmd, { encoding: 'utf8', maxBuffer: 1 << 28 }).trim()
const tracked = (pattern) => sh(`git ls-files ${pattern}`).split('\n').filter(Boolean)
const lines = (files) => files.reduce((n, f) => n + readFileSync(f, 'utf8').split('\n').length, 0)
const bytes = (files) => files.reduce((n, f) => n + statSync(f).size, 0)
const mb = (n) => (n / 1024 / 1024).toFixed(1) + ' MB'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const deps = Object.keys(pkg.dependencies || {}).length + Object.keys(pkg.devDependencies || {}).length

const renderer = tracked("'src/**/*.ts' 'src/**/*.vue' 'src/**/*.css'").filter((f) => !f.includes('__tests__') && !f.includes('/integration/'))
const rendererTests = tracked("'src/**/*.test.ts'")
const rust = tracked("'src-tauri/**/*.rs'")
const i18n = readFileSync('src/i18n/index.ts', 'utf8').match(/^\s+'[^']+':/gm)?.length || 0
const binaries = tracked("'static/engine/**' 'src-tauri/icons/**' 'public/**' 'screenshot/**'")

let nodeModules = 'n/a'
try {
  nodeModules = sh('du -sm node_modules').split('\t')[0] + ' MB'
} catch {}

const rows = [
  ['npm dependencies', deps],
  ['node_modules size', nodeModules],
  ['renderer lines (ts/vue/css)', lines(renderer)],
  ['renderer test lines', lines(rendererTests)],
  ['rust lines', lines(rust)],
  ['i18n keys (per locale)', i18n / 2],
  ['tracked binaries/assets', mb(bytes(binaries))]
]
const width = Math.max(...rows.map(([k]) => k.length))
for (const [k, v] of rows) console.log(k.padEnd(width) + '  ' + v)
