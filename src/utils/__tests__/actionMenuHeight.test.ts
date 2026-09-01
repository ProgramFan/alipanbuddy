import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(vue|css)$/.test(path) ? [path] : []
  })
}

describe('action menu height', () => {
  const root = resolve(process.cwd(), 'src')
  const globalCss = readFileSync(join(root, 'assets/global.css'), 'utf8')

  it('caps the dropdown popups on the viewport instead of a fixed height', () => {
    expect(globalCss).toMatch(/body \.arco-dropdown-list-wrapper \{\s*max-height: calc\(100vh/)
  })

  // A stray `max-height: 300px !important` in PanRight.vue outlived two attempts to
  // lift this cap, so the new / upload / right-click menus scrolled at every window
  // size no matter what global.css said.
  it('has no component rule re-capping the toolbar and right-click menus', () => {
    const offenders = sourceFiles(root)
      .filter((file) => file !== join(root, 'assets/global.css'))
      .filter((file) => {
        const rule = readFileSync(file, 'utf8').match(/\.rightmenu[^{]*\.arco-dropdown-list-wrapper[^{]*\{[^}]*\}/)
        return Boolean(rule && rule[0].includes('max-height'))
      })
      .map((file) => file.slice(root.length + 1))
    expect(offenders).toEqual([])
  })

  it('thins Arco s popup scrollbar down to the webkit thumb size', () => {
    expect(globalCss).toContain('body .arco-scrollbar-track-direction-vertical')
    expect(globalCss).toMatch(/body \.arco-scrollbar-thumb-direction-vertical \.arco-scrollbar-thumb-bar \{\s*width: 4px/)
  })
})
