import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('material theme page surfaces', () => {
  it('lets top tabs use all available header space before window controls', () => {
    const source = readSource('src/layout/PageMain.vue')
    expect(source).not.toMatch(/<\/a-menu>\s*<div class='flexauto'><\/div>\s*<ShutDown \/>/s)
    expect(source).toMatch(/#xbyhead2 \.arco-menu-horizontal\s*\{[^}]*width:\s*0[^}]*flex:\s*1 1 auto/s)
  })

  it('keeps the app canvas flat on the theme surface without decorative overlays', () => {
    const source = readSource('src/layout/PageMain.vue')
    expect(source).toMatch(/#xbybody\s*\{[^}]*background:\s*var\(--md-surface-dim\)/s)
    expect(source).not.toMatch(/#xbybody::before/)
    expect(source).not.toMatch(/backdrop-filter:\s*blur/)
  })

  it('keeps content panes transparent instead of floating rounded islands', () => {
    const source = readSource('src/layout/PageMain.vue')
    expect(source).toMatch(/#xbybody \.xbyright > \.hidetabs,[^{]*#xbybody \.rightbg,[^{]*#xbybody \.settings-content\s*\{[^}]*border:\s*0\s*!important[^}]*border-radius:\s*0\s*!important[^}]*background:\s*transparent\s*!important/s)
    expect(source).toMatch(/#xbybody \.settings-content\s*\{[^}]*height:\s*100%[^}]*margin:\s*0\s*!important/s)
    expect(readSource('src/setting/index.vue')).not.toMatch(/body:not\(\[arco-theme='dark'\]\) #xbybody #SettingObserver\s*\{[^}]*background:/s)
  })

  it('keeps sidebars as flat panes with a hairline divider', () => {
    const source = readSource('src/layout/PageMain.vue')
    expect(source).toMatch(/#xbybody \.xbyleft,[^{]*#xbybody \.settings-sider,[^{]*#xbybody \.rss-sider\s*\{[^}]*background:\s*var\(--md-surface-container-low\)\s*!important[^}]*border-right:\s*1px solid var\(--md-outline-variant\)\s*!important[^}]*border-radius:\s*0\s*!important/s)
  })

  it('keeps transfer statistics readable in the light theme', () => {
    const source = readSource('src/layout/PageMain.vue')
    expect(source).toMatch(/body:not\(\[arco-theme='dark'\]\) #xbybody \.cellcount \.arco-badge-status-text\s*\{[^}]*color:\s*var\(--color-text-2\)/s)
  })

  it('keeps the plugin canvas transparent over the theme surface', () => {
    const source = readSource('src/rss/index.vue')
    expect(source).toMatch(/\.rss-content-panel\s*\{[^}]*background:\s*transparent\s*!important/s)
    expect(source).not.toMatch(/backdrop-filter:\s*blur/)
  })

  it('keeps settings surfaces on material tokens', () => {
    const source = readSource('src/setting/index.vue')
    expect(source).not.toContain("<small>{{ t('settings.centerSubtitle') }}</small>")
    expect(source).toMatch(/\.settings-side-title\s*\{[^}]*background:\s*transparent/s)
    expect(source).toMatch(/\.settings-section\s*\{[^}]*border:\s*1px solid var\(--md-outline-variant\)[^}]*border-radius:\s*var\(--md-shape-md\)[^}]*background:\s*var\(--md-surface\)/s)
    expect(source).toMatch(/#xbybody #SettingObserver \.settingcard\s*\{[^}]*border:\s*0\s*!important[^}]*border-radius:\s*0\s*!important[^}]*background:\s*transparent\s*!important[^}]*box-shadow:\s*none\s*!important/s)
    expect(source).not.toMatch(/backdrop-filter:\s*blur/)
  })

  it('uses the active Arco dark-theme hook for the settings log panel', () => {
    const source = readSource('src/setting/SettingLog.vue')
    expect(source).not.toContain('html.dark .loglist')
    expect(source).toMatch(/body\[arco-theme='dark'\] #xbybody \.loglist\s*\{[^}]*background:\s*var\(--md-surface-dim\)/s)
    expect(source).toMatch(/body\[arco-theme='dark'\] #xbybody \.loglist \.arco-list-item\s*\{[^}]*color:\s*rgba\(232, 238, 249, 0\.88\)/s)
  })

  it('uses a single outer boundary for transfer, share and plugin navigation', () => {
    const main = readSource('src/layout/PageMain.vue')
    const settings = readSource('src/setting/index.vue')
    const sidebars = [readSource('src/down/index.vue'), readSource('src/share/index.vue'), readSource('src/rss/index.vue'), settings]

    for (const sidebar of sidebars) {
      expect(sidebar).toContain('single-boundary-sidebar')
      expect(sidebar).toContain('single-boundary-sidebar-menu')
    }

    expect(main).toMatch(/#xbybody \.single-boundary-sidebar > \.single-boundary-sidebar-menu\s*\{[^}]*padding:\s*0[^}]*border:\s*0\s*!important[^}]*background:\s*transparent\s*!important[^}]*box-shadow:\s*none\s*!important/s)
    expect(main).toMatch(/#xbybody \.single-boundary-sidebar \.single-boundary-sidebar-menu \.arco-menu-item\s*\{[^}]*border:\s*0\s*!important[^}]*box-shadow:\s*none\s*!important/s)
    expect(main).toMatch(/#xbybody \.single-boundary-sidebar \.single-boundary-sidebar-menu \.arco-menu-selected\s*\{[^}]*border-color:\s*transparent\s*!important[^}]*box-shadow:\s*none\s*!important/s)
    expect(main).toMatch(/#xbybody \.single-boundary-sidebar \.single-boundary-sidebar-menu \.arco-menu-item::before,[^{]*\.arco-menu-item::after\s*\{[^}]*display:\s*none\s*!important/s)
    expect(settings).not.toMatch(/body\[arco-theme='dark'\] \.xbyleftmenu/)
    expect(settings).not.toMatch(/^\.xbyleftmenu/m)
    expect(settings).toMatch(/\.settings-sider \.xbyleftmenu\s*\{[^}]*padding:\s*0[^}]*border:\s*0[^}]*border-radius:\s*0[^}]*background:\s*transparent\s*!important[^}]*box-shadow:\s*none\s*!important/s)
  })
})
