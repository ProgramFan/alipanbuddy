import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('settings app version', () => {
  it('reads the installed version from the Tauri platform info after an installed update', () => {
    const bridgeSource = readFileSync(resolve(process.cwd(), 'src/tauri/bridge.ts'), 'utf8')
    const settingSource = readFileSync(resolve(process.cwd(), 'src/setting/SettingUI.vue'), 'utf8')

    expect(bridgeSource).toContain('appVersion: string')
    expect(bridgeSource).toContain('window.WebPlatformSync = ')
    expect(settingSource).toContain('window.WebPlatformSync?.(')
    expect(settingSource).toContain('data.appVersion')
    expect(settingSource).toContain('installedAppVersion.value = data.appVersion')
  })

  it('checks release metadata directly and only proxies the update asset', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/aliapi/server.ts'), 'utf8')

    expect(source).toContain('static getInstalledVersion()')
    expect(source).toContain('window.WebPlatformSync?.(')
    expect(source).toContain('.get(ServerHttp.updateUrl')
    expect(source).toContain('buildUpdateProxyUrl(settingStore.uiUpdateProxyUrl, verData.verUrl)')
    expect(source).toContain('const configVer = this.getInstalledVersion()')
    expect(source).not.toContain('process.arch')
    expect(source).not.toContain(".asar")
  })

  it('keeps the in-app startup check behind the setting and routes it through the Tauri updater', () => {
    const pageMainSource = readFileSync(resolve(process.cwd(), 'src/layout/PageMain.ts'), 'utf8')
    const bridgeSource = readFileSync(resolve(process.cwd(), 'src/tauri/bridge.ts'), 'utf8')
    const modalSource = readFileSync(resolve(process.cwd(), 'src/pan/topbtns/ShowUpdateModal.vue'), 'utf8')

    expect(pageMainSource).toContain('useSettingStore().uiLaunchAutoCheckUpdate')
    expect(pageMainSource).toContain('window.AutoUpdateCheck?.(false)')
    expect(bridgeSource).toContain("invoke('auto_update_check'")
    expect(modalSource).toContain('window.AutoUpdateCheck?.(true)')
    expect(modalSource).toContain('window.AutoUpdateOnStateChanged?.(')
    expect(modalSource).not.toContain('child_process')
  })
})
