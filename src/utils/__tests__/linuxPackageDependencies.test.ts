import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Tauri bundle configuration', () => {
  const config = JSON.parse(readFileSync(resolve(process.cwd(), 'src-tauri/tauri.conf.json'), 'utf8'))

  it('uses the AlipanBuddy application identifier', () => {
    expect(config.identifier).toBe('com.alipanbuddy.app')
  })

  it('ships the aria2c sidecar as an external binary', () => {
    expect(config.bundle.externalBin).toContain('binaries/aria2c')
  })

  it('bundles the Linux, Windows and macOS targets', () => {
    for (const target of ['deb', 'rpm', 'appimage', 'nsis', 'dmg']) {
      expect(config.bundle.targets).toContain(target)
    }
  })

  it('does not require Electron runtime libraries for the Linux packages', () => {
    const depends: string[] = config.bundle?.linux?.deb?.depends || []
    expect(depends).not.toContain('http-parser')
    expect(depends).not.toContain('libnotify')
  })
})
