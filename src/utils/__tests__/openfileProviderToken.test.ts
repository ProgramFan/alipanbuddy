import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('file-open account routing', () => {
  it('resolves the file token from the file owner before the active account', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/utils/openfile.ts'), 'utf8')

    expect(source).toContain('return resolveDriveFileToken(file as IAliGetFileModel & { user_id?: string }, useUserStore().user_id)')
    expect(source).toContain("if (!file.drive_id) file = { ...file, drive_id: usePanTreeStore().drive_id }")
  })
})
