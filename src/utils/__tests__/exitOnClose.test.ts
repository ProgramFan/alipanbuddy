import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const windowsRs = readFileSync(resolve(process.cwd(), 'src-tauri/src/windows.rs'), 'utf8')
const pageMain = readFileSync(resolve(process.cwd(), 'src/layout/PageMain.vue'), 'utf8')

describe('quit on close', () => {
  // The in-app close button routes through the renderer, but Alt+F4, the window
  // manager and a session logout raise CloseRequested in Rust instead. Both
  // paths have to read the setting or "quit on close" only works some of the time.
  it('honours uiExitOnClose in the renderer close button', () => {
    expect(pageMain).toMatch(/uiExitOnClose \? 'exit' : 'close'/)
  })

  it('honours uiExitOnClose in the Rust CloseRequested handler', () => {
    const handler = windowsRs.slice(windowsRs.indexOf('WindowEvent::CloseRequested'), windowsRs.indexOf('WindowEvent::Resized'))
    expect(handler).toContain('uiExitOnClose')
    expect(handler).toMatch(/exit_on_close\s*\{[\s\S]*handle\.exit\(0\)/)
  })
})
