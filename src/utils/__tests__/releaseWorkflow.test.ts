import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('release workflow', () => {
  const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/release.yml'), 'utf8')

  it('packages the app with tauri-action on every desktop platform', () => {
    expect(workflow).toContain('tauri-apps/tauri-action')
    expect(workflow).toContain('matrix')
    expect(workflow).toContain('windows')
    expect(workflow).toContain('ubuntu')
    expect(workflow).toContain('macos')
  })

  it('installs dependencies from the locked pnpm lockfile', () => {
    expect(workflow).toContain('pnpm install --frozen-lockfile')
  })

  it('generates the secrets strictly and prepares the aria2c sidecars before building', () => {
    expect(workflow).toContain('node scripts/generate-secrets.mjs --mode=ci --strict')
    expect(workflow).toContain('node scripts/prepare-sidecars.mjs')
  })
})
