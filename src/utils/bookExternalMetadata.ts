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
  source?: 'internetarchive'
}

type InternetArchiveSearchDocument = {
  identifier?: string
  title?: string
  creator?: string | string[]
  isbn?: string | string[]
}

type InternetArchiveMetadata = {
  title?: string
  creator?: string | string[]
  description?: string | string[]
  isbn?: string | string[]
  publisher?: string | string[]
  year?: string | number
  language?: string | string[]
  subject?: string | string[]
}

type InternetArchiveRecord = {
  metadata?: InternetArchiveMetadata
  files?: Array<{ name?: string; format?: string }>
}

type BookMetadataCandidate = {
  title?: string
  authors?: string[]
  isbn?: string[]
}

const INTERNET_ARCHIVE_SEARCH_URL = 'https://archive.org/advancedsearch.php'
const INTERNET_ARCHIVE_METADATA_URL = 'https://archive.org/metadata/'
const EXTERNAL_BOOK_METADATA_TIMEOUT_MS = 6000
const UNKNOWN_AUTHOR = new Set(['', '未知作者', 'unknown author'])
export type ExternalBookMetadataLogger = (message: string, error?: unknown) => void

function normalized(value = ''): string {
  return value.toLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, '')
}

function firstText(value: string | string[] | undefined): string {
  return Array.isArray(value) ? String(value[0] || '') : String(value || '')
}

function toArray(value: string | string[] | undefined): string[] {
  return Array.isArray(value) ? value : value ? [value] : []
}

function quotedSearchTerm(value: string): string {
  return `"${value.replace(/["\\]/g, '\\$&')}"`
}

function buildInternetArchiveSearchUrl(book: IBookItem): string {
  const params = new URLSearchParams({ output: 'json', rows: '5', page: '1' })
  const isbn = String(book.isbn || '').replace(/[^0-9Xx]/g, '')
  if (/^(?:97[89]\d{10}|\d{9}[\dX])$/i.test(isbn)) params.set('q', `isbn:${isbn} AND mediatype:texts`)
  else {
    const title = book.title || book.file_name.replace(/\.[^.]+$/, '')
    const author = UNKNOWN_AUTHOR.has(normalized(book.author || '')) ? '' : book.author || ''
    params.set('q', [title && `title:${quotedSearchTerm(title)}`, author && `creator:${quotedSearchTerm(author)}`, 'mediatype:texts'].filter(Boolean).join(' AND '))
  }
  for (const field of ['identifier', 'title', 'creator', 'isbn']) params.append('fl[]', field)
  return `${INTERNET_ARCHIVE_SEARCH_URL}?${params.toString()}`
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

async function lookupInternetArchiveMetadata(book: IBookItem, request: typeof fetch): Promise<ExternalBookMetadata | null> {
  const response = await request(buildInternetArchiveSearchUrl(book), { signal: AbortSignal.timeout(EXTERNAL_BOOK_METADATA_TIMEOUT_MS) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const body = await response.json() as { response?: { docs?: InternetArchiveSearchDocument[] } }
  const candidate = (body.response?.docs || [])
    .map((item) => ({ item, score: matchScore(book, { title: item.title, authors: toArray(item.creator), isbn: toArray(item.isbn) }) }))
    .sort((a, b) => b.score - a.score)[0]
  if (!candidate?.item.identifier || candidate.score < 75) return null
  const metadataResponse = await request(`${INTERNET_ARCHIVE_METADATA_URL}${encodeURIComponent(candidate.item.identifier)}`, { signal: AbortSignal.timeout(EXTERNAL_BOOK_METADATA_TIMEOUT_MS) })
  if (!metadataResponse.ok) throw new Error(`HTTP ${metadataResponse.status}`)
  const record = await metadataResponse.json() as InternetArchiveRecord
  const info = record.metadata || {}
  const thumbnail = record.files?.find((file) => file.name === '__ia_thumb.jpg' || file.format === 'JPEG Thumb')?.name || ''
  return {
    title: info.title || candidate.item.title,
    author: firstText(info.creator) || firstText(candidate.item.creator),
    summary: firstText(info.description),
    coverUrl: thumbnail ? `https://archive.org/download/${encodeURIComponent(candidate.item.identifier)}/${encodeURIComponent(thumbnail)}` : '',
    isbn: firstText(info.isbn) || firstText(candidate.item.isbn),
    publisher: firstText(info.publisher),
    publishedDate: info.year ? String(info.year) : '',
    language: firstText(info.language),
    subjects: toArray(info.subject).slice(0, 8),
    source: 'internetarchive'
  }
}

export function canHydrateExternalBookMetadata(book: IBookItem): boolean {
  return !book.cover_url && !book.thumbnail && !String(book.metadata_source || '').startsWith('internetarchive') && !!(book.title || book.file_name)
}

export async function lookupExternalBookMetadata(book: IBookItem, request: typeof fetch = fetch, log?: ExternalBookMetadataLogger): Promise<ExternalBookMetadata | null> {
  const logPrefix = `[book-metadata] ${book.ext.toUpperCase()} ${book.file_name}`
  try {
    log?.(`${logPrefix} 查询 Internet Archive：title=${book.title || '-'} author=${book.author || '-'} isbn=${book.isbn || '-'}`)
    const archiveRequest: typeof fetch = (input, init) => runRateLimitedScanRequest('external:internetarchive', () => request(input, init))
    const meta = await lookupInternetArchiveMetadata(book, archiveRequest)
    if (!meta) {
      log?.(`${logPrefix} Internet Archive 未命中`)
      return null
    }
    log?.(`${logPrefix} Internet Archive 命中：${meta.title || '-'}，封面=${meta.coverUrl ? '有' : '无'}`)
    return meta
  } catch (error) {
    log?.(`${logPrefix} Internet Archive 请求失败`, error)
    return null
  }
}

export function buildExternalBookMetadataPatch(meta: ExternalBookMetadata, now = Date.now()): Partial<IBookItem> {
  const patch: Partial<IBookItem> = { metadata_source: meta.source || 'internetarchive', metadata_updated_at: now }
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
