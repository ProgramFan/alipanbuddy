import { describe, expect, it, vi } from 'vitest'
import { buildExternalBookMetadataPatch, canHydrateExternalBookMetadata, lookupExternalBookMetadata } from '../bookExternalMetadata'
import type { IBookItem } from '../../types/book'

function book(overrides: Partial<IBookItem> = {}): IBookItem {
  return { id: 'book', user_id: 'user', drive_id: 'drive', file_id: 'file', parent_file_id: 'root', file_name: '三体.epub', ext: 'epub', size: 1024, category: 'book', title: '三体', author: '刘慈欣', scanned_at: 1, ...overrides }
}

describe('book external metadata', () => {
  it('looks up public Internet Archive metadata without credentials', async () => {
    const requestMock = vi.fn(async (url: string) => {
      if (url.includes('advancedsearch.php')) return { ok: true, json: async () => ({ response: { docs: [{ identifier: 'threebodyarchive', title: '三体', creator: '刘慈欣', isbn: '9787536692930' }] } }) }
      return { ok: true, json: async () => ({ metadata: { title: '三体', creator: '刘慈欣', description: '科幻小说', language: 'chi', subject: ['科幻'] }, files: [{ name: '__ia_thumb.jpg', format: 'JPEG Thumb' }] }) }
    })
    await expect(lookupExternalBookMetadata(book(), requestMock as unknown as typeof fetch)).resolves.toMatchObject({ title: '三体', source: 'internetarchive', coverUrl: 'https://archive.org/download/threebodyarchive/__ia_thumb.jpg' })
    expect(String(requestMock.mock.calls[0][0])).toContain('archive.org/advancedsearch.php')
    expect(String(requestMock.mock.calls[0][0])).toContain('mediatype%3Atexts')
    expect(String(requestMock.mock.calls[1][0])).toBe('https://archive.org/metadata/threebodyarchive')
  })

  it('does not request metadata when Internet Archive search has no confident match', async () => {
    const requestMock = vi.fn(async () => ({ ok: true, json: async () => ({ response: { docs: [{ identifier: 'other-book', title: '不同的书', creator: '其他作者' }] } }) }))
    const logs: string[] = []
    await expect(lookupExternalBookMetadata(book(), requestMock as unknown as typeof fetch, (message) => logs.push(message))).resolves.toBeNull()
    expect(requestMock).toHaveBeenCalledTimes(1)
    expect(logs.some((message) => message.includes('Internet Archive 未命中'))).toBe(true)
  })

  it('rejects low confidence results and preserves existing cover records', async () => {
    const request = vi.fn(async () => ({ ok: true, json: async () => ({ response: { docs: [{ identifier: 'other-book', title: '不同的书', creator: '其他作者' }] } }) })) as unknown as typeof fetch
    await expect(lookupExternalBookMetadata(book(), request)).resolves.toBeNull()
    expect(canHydrateExternalBookMetadata(book({ cover_url: 'https://cover.example/a.jpg' }))).toBe(false)
    expect(buildExternalBookMetadataPatch({ title: 'Title', coverUrl: 'https://cover.example/a.jpg' }, 123)).toMatchObject({ metadata_source: 'internetarchive', metadata_updated_at: 123, cover_url: 'https://cover.example/a.jpg' })
  })

  it('reports lookup outcomes to the caller supplied diagnostics logger', async () => {
    const source = await import('node:fs').then(({ readFileSync }) => readFileSync(new URL('../bookExternalMetadata.ts', import.meta.url), 'utf8'))

    expect(source).toContain('ExternalBookMetadataLogger')
    expect(source).toContain('archive.org/advancedsearch.php')
    expect(source).toContain('archive.org/metadata/')
    expect(source).not.toContain('googleapis.com')
    expect(source).toContain('const EXTERNAL_BOOK_METADATA_TIMEOUT_MS = 6000')
    expect(source).toContain('log?.(`${logPrefix} Internet Archive 请求失败`, error)')
    expect(source).toContain('log?.(`${logPrefix} Internet Archive 命中：')
  })
})
