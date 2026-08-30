import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('settings app version', () => {
  it('reads the installed version from the Tauri platform info', () => {
    const bridgeSource = readFileSync(resolve(process.cwd(), 'src/tauri/bridge.ts'), 'utf8')
    const settingSource = readFileSync(resolve(process.cwd(), 'src/setting/SettingUI.vue'), 'utf8')

    expect(bridgeSource).toContain('appVersion: string')
    expect(bridgeSource).toContain('window.WebPlatformSync = ')
    expect(settingSource).toContain('window.WebPlatformSync?.(')
    expect(settingSource).toContain('data.appVersion')
    expect(settingSource).toContain('installedAppVersion.value = data.appVersion')
  })
})
