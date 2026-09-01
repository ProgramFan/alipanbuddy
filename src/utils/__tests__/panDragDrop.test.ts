import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const panRight = readFileSync(resolve(process.cwd(), 'src/pan/PanRight.vue'), 'utf8')
const panLeft = readFileSync(resolve(process.cwd(), 'src/pan/PanLeft.vue'), 'utf8')

describe('dragging file rows onto the tree and the shortcuts box', () => {
  // WebKit never completes a drop when dragstart leaves the data store empty,
  // so every drop target silently refuses. Chromium did not care.
  it('puts something in the drag data store on dragstart', () => {
    const dragStart = panRight.slice(panRight.indexOf('const onRowItemDragStart'), panRight.indexOf('const onRowItemDragEnter'))
    expect(dragStart).toMatch(/dataTransfer\.setData\(/)
  })

  it('lets the drop targets accept the drag by preventing the default dragover', () => {
    for (const handler of ['onQuickDragOver', 'onRowItemDragOver']) {
      const body = panLeft.slice(panLeft.indexOf(`const ${handler}`), panLeft.indexOf(`const ${handler}`) + 220)
      expect(body).toContain('preventDefault()')
    }
  })
})
