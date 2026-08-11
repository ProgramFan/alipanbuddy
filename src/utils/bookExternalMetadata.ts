import type { IBookItem } from '../types/book'
import { runRateLimitedScanRequest } from './libraryScanRateLimiter'

export interface ExternalBookMetadata {
  title?: string
  author?: string
  summary?: string
  coverUrl?: string
  isbn?: string
  publisher?: string
  publishedDate?: string
  language?: string
  subjects?: string[]
  source?: 'openlibrary' | 'googlebooks'
}

type OpenLibraryDocument = {
  title?: string
  author_name?: string[]
  cover_i?: number
  isbn?: string[]
  publisher?: string[]
  first_publish_year?: number
  language?: string[]
  subject?: string[]
  first_sentence?: string | string[]
}

type GoogleBooksVolume = {
  volumeInfo?: {
    title?: string
    authors?: string[]
    description?: string
    imageLinks?: { thumbnail?: string; smallThumbnail?: string }
    industryIdentifiers?: Array<{ identifier?: string }>
    publisher?: string
    publishedDate?: string
    language?: string
    categories?: string[]
  }
}

type BookMetadataCandidate = {
  title?: string
  authors?: string[]
  isbn?: string[]
}

const OPEN_LIBRARY_SEARCH_URL = 'https://openlibrary.org/search.json'
const GOOGLE_BOOKS_SEARCH_URL = 'https://www.googleapis.com/books/v1/volumes'
const EXTERNAL_BOOK_METADATA_TIMEOUT_MS = 6000
const UNKNOWN_AUTHOR = new Set(['', '未知作者', 'unknown author'])
export type ExternalBookMetadataLogger = (message: string, error?: unknown) => void

function normalized(value = ''): string {
  return value.toLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, '')
}

function firstText(value: string | string[] | undefined): string {
  return Array.isArray(value) ? String(value[0] || '') : String(value || '')
}

function buildSearchUrl(book: IBookItem): string {
  const params = new URLSearchParams({ fields: 'title,author_name,cover_i,isbn,publisher,first_publish_year,language,subject,first_sentence', limit: '5' })
  const isbn = String(book.isbn || '').replace(/[^0-9Xx]/g, '')
  if (/^(?:97[89]\d{10}|\d{9}[\dX])$/i.test(isbn)) params.set('isbn', isbn)
  else {
    params.set('title', book.title || book.file_name.replace(/\.[^.]+$/, ''))
    if (!UNKNOWN_AUTHOR.has(normalized(book.author || ''))) params.set('author', book.author || '')
  }
  return `${OPEN_LIBRARY_SEARCH_URL}?${params.toString()}`
}

function buildGoogleBooksSearchUrl(book: IBookItem): string {
  const params = new URLSearchParams({ maxResults: '5', projection: 'full' })
  const isbn = String(book.isbn || '').replace(/[^0-9Xx]/g, '')
  if (/^(?:97[89]\d{10}|\d{9}[\dX])$/i.test(isbn)) params.set('q', `isbn:${isbn}`)
  else {
    const title = book.title || book.file_name.replace(/\.[^.]+$/, '')
    const author = UNKNOWN_AUTHOR.has(normalized(book.author || '')) ? '' : book.author || ''
    params.set('q', [title && `intitle:${title}`, author && `inauthor:${author}`].filter(Boolean).join('+'))
  }
  return `${GOOGLE_BOOKS_SEARCH_URL}?${params.toString()}`
}

function matchScore(book: IBookItem, candidate: BookMetadataCandidate): number {
  const isbn = String(book.isbn || '').replace(/[^0-9Xx]/g, '').toLowerCase()
  if (isbn && candidate.isbn?.some((value) => String(value).replace(/[^0-9Xx]/g, '').toLowerCase() === isbn)) return 100
  const title = normalized(book.title || book.file_name.replace(/\.[^.]+$/, ''))
  const candidateTitle = normalized(candidate.title || '')
  if (!title || !candidateTitle) return 0
  let score = title === candidateTitle ? 75 : (candidateTitle.includes(title) || title.includes(candidateTitle) ? 50 : 0)
  const author = normalized(book.author || '')
  const authors = (candidate.authors || []).map((value) => normalized(value))
  if (!UNKNOWN_AUTHOR.has(author) && authors.some((value) => value === author || value.includes(author) || author.includes(value))) score += 25
  return score
}

async function lookupOpenLibraryMetadata(book: IBookItem, request: typeof fetch): Promise<ExternalBookMetadata | null> {
  const response = await request(buildSearchUrl(book), { signal: AbortSignal.timeout(EXTERNAL_BOOK_METADATA_TIMEOUT_MS) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const body = await response.json() as { docs?: OpenLibraryDocument[] }
  const candidate = (body.docs || [])
    .map((doc) => ({ doc, score: matchScore(book, { title: doc.title, authors: doc.author_name, isbn: doc.isbn }) }))
    .sort((a, b) => b.score - a.score)[0]
  if (!candidate || candidate.score < 75) return null
  const doc = candidate.doc
  return {
    title: doc.title,
    author: firstText(doc.author_name),
    summary: firstText(doc.first_sentence),
    coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : '',
    isbn: firstText(doc.isbn),
    publisher: firstText(doc.publisher),
    publishedDate: doc.first_publish_year ? String(doc.first_publish_year) : '',
    language: firstText(doc.language),
    subjects: (doc.subject || []).slice(0, 8),
    source: 'openlibrary'
  }
}

async function lookupGoogleBooksMetadata(book: IBookItem, request: typeof fetch): Promise<ExternalBookMetadata | null> {
  const response = await request(buildGoogleBooksSearchUrl(book), { signal: AbortSignal.timeout(EXTERNAL_BOOK_METADATA_TIMEOUT_MS) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const body = await response.json() as { items?: GoogleBooksVolume[] }
  const candidate = (body.items || [])
    .map((item) => {
      const info = item.volumeInfo || {}
      return { info, score: matchScore(book, { title: info.title, authors: info.authors, isbn: info.industryIdentifiers?.map((item) => item.identifier || '') }) }
    })
    .sort((a, b) => b.score - a.score)[0]
  if (!candidate || candidate.score < 75) return null
  const info = candidate.info
  const coverUrl = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || ''
  return {
    title: info.title,
    author: firstText(info.authors),
    summary: info.description,
    coverUrl: coverUrl.replace(/^http:/, 'https:'),
    isbn: firstText(info.industryIdentifiers?.map((item) => item.identifier || '')),
    publisher: info.publisher,
    publishedDate: info.publishedDate,
    language: info.language,
    subjects: info.categories?.slice(0, 8),
    source: 'googlebooks'
  }
}

export function canHydrateExternalBookMetadata(book: IBookItem): boolean {
  return !book.cover_url && !book.thumbnail && !String(book.metadata_source || '').startsWith('openlibrary') && !!(book.title || book.file_name)
}

export async function lookupExternalBookMetadata(book: IBookItem, request: typeof fetch = fetch, log?: ExternalBookMetadataLogger): Promise<ExternalBookMetadata | null> {
  const logPrefix = `[book-metadata] ${book.ext.toUpperCase()} ${book.file_name}`
  const providers = [
    { name: 'OpenLibrary', lookup: lookupOpenLibraryMetadata },
    { name: 'Google Books', lookup: lookupGoogleBooksMetadata }
  ]
  for (const provider of providers) {
    try {
      log?.(`${logPrefix} 查询 ${provider.name}：title=${book.title || '-'} author=${book.author || '-'} isbn=${book.isbn || '-'}`)
      const scope = provider.name === 'Google Books' ? 'external:googlebooks' : 'external:openlibrary'
      const meta = await runRateLimitedScanRequest(scope, () => provider.lookup(book, request))
      if (!meta) {
        log?.(`${logPrefix} ${provider.name} 未命中`)
        continue
      }
      log?.(`${logPrefix} ${provider.name} 命中：${meta.title || '-'}，封面=${meta.coverUrl ? '有' : '无'}`)
      return meta
    } catch (error) {
      log?.(`${logPrefix} ${provider.name} 请求失败`, error)
    }
  }
  return null
}

export function buildExternalBookMetadataPatch(meta: ExternalBookMetadata, now = Date.now()): Partial<IBookItem> {
  const patch: Partial<IBookItem> = { metadata_source: meta.source || 'openlibrary', metadata_updated_at: now }
  if (meta.title) patch.title = meta.title
  if (meta.author) patch.author = meta.author
  if (meta.summary) patch.summary = meta.summary
  if (meta.coverUrl) patch.cover_url = meta.coverUrl
  if (meta.isbn) patch.isbn = meta.isbn
  if (meta.publisher) patch.publisher = meta.publisher
  if (meta.publishedDate) patch.published_date = meta.publishedDate
  if (meta.language) patch.language = meta.language
  if (meta.subjects?.length) patch.subjects = meta.subjects
  return patch
}
