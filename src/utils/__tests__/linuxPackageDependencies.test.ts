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

  it('leaves the Linux packages to scripts/build-linux-packages.sh', () => {
    expect(config.bundle.targets).toContain('nsis')
    for (const target of ['deb', 'rpm', 'appimage']) {
      expect(config.bundle.targets).not.toContain(target)
    }
  })
})

describe('Linux tarball layout', () => {
  const script = readFileSync(resolve(process.cwd(), 'scripts/build-linux-packages.sh'), 'utf8')
  const installer = readFileSync(resolve(process.cwd(), 'scripts/linux-tarball/install.sh'), 'utf8')

  it('stages the tarball without the usr/ prefix the packages use', () => {
    expect(script).toContain('stage_tree "$OUT/$NAME" ""')
    expect(script).toContain('stage_tree "$DEBROOT"\n')
    expect(script).toContain('stage_tree "$RPMSRC"\n')
  })

  it('installs from the prefix-relative tarball tree', () => {
    expect(installer).not.toContain('$SRC/usr/')
    expect(installer).toContain('"$SRC/lib/alipanbuddy/alipanbuddy"')
    expect(installer).toContain('"$SRC/share/applications/alipanbuddy.desktop"')
  })
})

describe('Linux package dependencies', () => {
  const script = readFileSync(resolve(process.cwd(), 'scripts/build-linux-packages.sh'), 'utf8')

  it('derives the .deb Depends from the built binary', () => {
    expect(script).toContain('dpkg-shlibdeps')
    expect(script).toContain('Depends: $(deb_depends)')
  })

  it('falls back to the full webkit/gtk/soup/tls dependency set', () => {
    for (const pkg of ['libwebkit2gtk-4.1-0', 'libjavascriptcoregtk-4.1-0', 'libgtk-3-0', 'libglib2.0-0', 'libsoup-3.0-0', 'libssl3']) {
      expect(script).toContain(pkg)
    }
  })

  it('names the dlopen-only tray library both packages need', () => {
    expect(script).toContain('libayatana-appindicator3-1 | libappindicator3-1')
    expect(script).toContain('(libayatana-appindicator3.so.1()(64bit) or libappindicator3.so.1()(64bit))')
  })

  it('gives the .rpm explicit soname requires instead of trusting rpmbuild on Ubuntu', () => {
    expect(script).toContain('Requires: ${soname}()(64bit)')
    expect(script).toContain('$(rpm_requires)')
  })

  it('does not require Electron runtime libraries', () => {
    expect(script).not.toContain('http-parser')
    expect(script).not.toContain('libnotify')
  })
})
