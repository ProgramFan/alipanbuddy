import type { IBookItem } from '../types/book'
import type { EpubMetadata } from './bookEpubMeta'

export const CLOUD_EPUB_METADATA_MAX_BYTES = 10 * 1024 * 1024

export function canHydrateCloudEpubMetadata(book: IBookItem): boolean {
  return (book.ext || '').toLowerCase() === 'epub'
    && book.user_id !== 'local'
    && !!book.user_id
    && !!book.drive_id
    && !!book.file_id
    && book.size > 0
    && book.size <= CLOUD_EPUB_METADATA_MAX_BYTES
    && !book.cover_url
    && !book.thumbnail
    && book.metadata_source !== 'epub_embedded'
}

export function buildEmbeddedEpubMetadataPatch(meta: EpubMetadata, now = Date.now()): Partial<IBookItem> {
  const patch: Partial<IBookItem> = {
    metadata_source: 'epub_embedded',
    metadata_updated_at: now
  }
  if (meta.title) patch.title = meta.title
  if (meta.author) patch.author = meta.author
  if (meta.description) patch.summary = meta.description
  if (meta.coverDataUrl) patch.cover_url = meta.coverDataUrl
  if (meta.isbn) patch.isbn = meta.isbn
  if (meta.publisher) patch.publisher = meta.publisher
  if (meta.language) patch.language = meta.language
  if (meta.subjects?.length) patch.subjects = meta.subjects
  return patch
}
