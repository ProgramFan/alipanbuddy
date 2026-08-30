import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

it('uploads dropped files through the Tauri drag-drop handler and rejects empty paths', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/pan/PanRight.vue'), 'utf8')
  expect(source).toContain("import { setDropHandler } from '../tauri/dragDrop'")
  expect(source).toContain('setDropHandler((paths) => uploadDroppedPaths(paths))')
  expect(source).toContain('setDropHandler(undefined)')
  expect(source).toContain('const uploadDroppedPaths = (paths: string[]) => {')
  expect(source).toContain('if (!files.length)')
  expect(source).toContain('modalUpload(targetDirId, files)')
})

it('no longer reads local paths from HTML5 DataTransfer files', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/pan/PanRight.vue'), 'utf8')
  expect(source).not.toContain('WebGetPathForFile')
  expect(source).not.toContain('(file as any).path')
})

it('forwards Tauri drop events with real file paths to the registered handler', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/tauri/dragDrop.ts'), 'utf8')
  expect(source).toContain('export function setDropHandler(fn: DropHandler | undefined)')
  expect(source).toContain('onDragDropEvent')
  expect(source).toContain("payload.type !== 'drop'")
})
