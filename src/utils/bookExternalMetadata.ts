import type { IBookItem } from '../types/book'

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

const OPEN_LIBRARY_SEARCH_URL = 'https://openlibrary.org/search.json'
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

function matchScore(book: IBookItem, candidate: OpenLibraryDocument): number {
  const isbn = String(book.isbn || '').replace(/[^0-9Xx]/g, '').toLowerCase()
  if (isbn && candidate.isbn?.some((value) => String(value).replace(/[^0-9Xx]/g, '').toLowerCase() === isbn)) return 100
  const title = normalized(book.title || book.file_name.replace(/\.[^.]+$/, ''))
  const candidateTitle = normalized(candidate.title || '')
  if (!title || !candidateTitle) return 0
  let score = title === candidateTitle ? 75 : (candidateTitle.includes(title) || title.includes(candidateTitle) ? 50 : 0)
  const author = normalized(book.author || '')
  const authors = (candidate.author_name || []).map((value) => normalized(value))
  if (!UNKNOWN_AUTHOR.has(author) && authors.some((value) => value === author || value.includes(author) || author.includes(value))) score += 25
  return score
}

export function canHydrateExternalBookMetadata(book: IBookItem): boolean {
  return !book.cover_url && !book.thumbnail && !String(book.metadata_source || '').startsWith('openlibrary') && !!(book.title || book.file_name)
}

export async function lookupExternalBookMetadata(book: IBookItem, request: typeof fetch = fetch, log?: ExternalBookMetadataLogger): Promise<ExternalBookMetadata | null> {
  const logPrefix = `[book-metadata] ${book.ext.toUpperCase()} ${book.file_name}`
  try {
    log?.(`${logPrefix} 查询 OpenLibrary：title=${book.title || '-'} author=${book.author || '-'} isbn=${book.isbn || '-'}`)
    const response = await request(buildSearchUrl(book), { signal: AbortSignal.timeout(12_000) })
    if (!response.ok) {
      log?.(`${logPrefix} OpenLibrary HTTP ${response.status}`)
      return null
    }
    const body = await response.json() as { docs?: OpenLibraryDocument[] }
    const candidate = (body.docs || [])
      .map((doc) => ({ doc, score: matchScore(book, doc) }))
      .sort((a, b) => b.score - a.score)[0]
    if (!candidate || candidate.score < 75) {
      log?.(`${logPrefix} 未命中：候选=${body.docs?.length || 0}，最高分=${candidate?.score || 0}`)
      return null
    }
    const doc = candidate.doc
    const coverUrl = doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : ''
    log?.(`${logPrefix} 命中：${doc.title || '-'}，得分=${candidate.score}，封面=${coverUrl ? '有' : '无'}`)
    return {
      title: doc.title,
      author: firstText(doc.author_name),
      summary: firstText(doc.first_sentence),
      coverUrl,
      isbn: firstText(doc.isbn),
      publisher: firstText(doc.publisher),
      publishedDate: doc.first_publish_year ? String(doc.first_publish_year) : '',
      language: firstText(doc.language),
      subjects: (doc.subject || []).slice(0, 8)
    }
  } catch (error) {
    log?.(`${logPrefix} OpenLibrary 请求失败`, error)
    throw error
  }
}

export function buildExternalBookMetadataPatch(meta: ExternalBookMetadata, now = Date.now()): Partial<IBookItem> {
  const patch: Partial<IBookItem> = { metadata_source: 'openlibrary', metadata_updated_at: now }
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
