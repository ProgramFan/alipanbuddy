import { describe, expect, it } from 'vitest'
import { buildEmbeddedEpubMetadataPatch, canHydrateCloudEpubMetadata, CLOUD_EPUB_METADATA_MAX_BYTES } from '../bookCloudMetadata'
import type { IBookItem } from '../../types/book'

function book(overrides: Partial<IBookItem> = {}): IBookItem {
  return {
    id: 'book', user_id: 'user', drive_id: 'drive', file_id: 'file', parent_file_id: 'root', file_name: 'book.epub', ext: 'epub', size: 1024, category: 'book', scanned_at: 1,
    ...overrides
  }
}

describe('book cloud metadata', () => {
  it('only downloads small cloud EPUBs which do not already have a cover', () => {
    expect(canHydrateCloudEpubMetadata(book())).toBe(true)
    expect(canHydrateCloudEpubMetadata(book({ cover_url: 'https://cover.example/book.jpg' }))).toBe(false)
    expect(canHydrateCloudEpubMetadata(book({ ext: 'mobi' }))).toBe(false)
    expect(canHydrateCloudEpubMetadata(book({ size: CLOUD_EPUB_METADATA_MAX_BYTES + 1 }))).toBe(false)
  })

  it('persists embedded metadata including the extracted cover', () => {
    expect(buildEmbeddedEpubMetadataPatch({ title: 'Title', author: 'Author', coverDataUrl: 'data:image/jpeg;base64,abc' }, 123)).toMatchObject({
      title: 'Title', author: 'Author', cover_url: 'data:image/jpeg;base64,abc', metadata_source: 'epub_embedded', metadata_updated_at: 123
    })
  })
})
