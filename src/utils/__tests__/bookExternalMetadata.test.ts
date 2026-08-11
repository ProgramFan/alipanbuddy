import { describe, expect, it, vi } from 'vitest'
import { buildExternalBookMetadataPatch, canHydrateExternalBookMetadata, lookupExternalBookMetadata } from '../bookExternalMetadata'
import type { IBookItem } from '../../types/book'

function book(overrides: Partial<IBookItem> = {}): IBookItem {
  return { id: 'book', user_id: 'user', drive_id: 'drive', file_id: 'file', parent_file_id: 'root', file_name: '三体.epub', ext: 'epub', size: 1024, category: 'book', title: '三体', author: '刘慈欣', scanned_at: 1, ...overrides }
}

describe('book external metadata', () => {
  it('uses a title and author search without downloading the book file', async () => {
    const requestMock = vi.fn(async (_url: string) => ({ ok: true, json: async () => ({ docs: [{ title: '三体', author_name: ['刘慈欣'], cover_i: 12, isbn: ['9787536692930'] }] }) }))
    await expect(lookupExternalBookMetadata(book(), requestMock as unknown as typeof fetch)).resolves.toMatchObject({ title: '三体', coverUrl: 'https://covers.openlibrary.org/b/id/12-L.jpg' })
    expect(String(requestMock.mock.calls[0][0])).toContain('title=%E4%B8%89%E4%BD%93')
    expect(String(requestMock.mock.calls[0][0])).toContain('author=%E5%88%98%E6%85%88%E6%AC%A3')
  })

  it('rejects low confidence results and preserves existing cover records', async () => {
    const request = vi.fn(async () => ({ ok: true, json: async () => ({ docs: [{ title: '不同的书', author_name: ['其他作者'] }] }) })) as unknown as typeof fetch
    await expect(lookupExternalBookMetadata(book(), request)).resolves.toBeNull()
    expect(canHydrateExternalBookMetadata(book({ cover_url: 'https://cover.example/a.jpg' }))).toBe(false)
    expect(buildExternalBookMetadataPatch({ title: 'Title', coverUrl: 'https://cover.example/a.jpg' }, 123)).toMatchObject({ metadata_source: 'openlibrary', metadata_updated_at: 123, cover_url: 'https://cover.example/a.jpg' })
  })
})
