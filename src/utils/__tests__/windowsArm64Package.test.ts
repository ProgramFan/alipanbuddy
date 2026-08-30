import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Windows ARM64 package configuration', () => {
  it('builds an ARM64 NSIS installer through the Tauri aarch64 target', () => {
    const config = JSON.parse(readFileSync(resolve(process.cwd(), 'src-tauri/tauri.conf.json'), 'utf8'))
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'))

    expect(config.bundle.targets).toContain('nsis')
    const script: string = packageJson.scripts['build:windows:arm64']
    expect(script).toBeTypeOf('string')
    expect(script).toContain('tauri build')
    expect(script).toContain('--target aarch64-pc-windows-msvc')
  })
})
