const CLOUD_SCAN_REQUEST_INTERVAL_MS = 400
const GOOGLE_BOOKS_REQUEST_INTERVAL_MS = 1500
const MAX_RATE_LIMIT_RETRIES = 2
const nextRequestAt = new Map<string, number>()

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function requestInterval(scope: string): number {
  return scope === 'external:googlebooks' ? GOOGLE_BOOKS_REQUEST_INTERVAL_MS : CLOUD_SCAN_REQUEST_INTERVAL_MS
}

async function waitForRequestSlot(scope: string): Promise<void> {
  const now = Date.now()
  const startAt = Math.max(now, nextRequestAt.get(scope) || 0)
  nextRequestAt.set(scope, startAt + requestInterval(scope))
  if (startAt > now) await delay(startAt - now)
}

function deferAfterRateLimit(scope: string, delayMs: number): void {
  nextRequestAt.set(scope, Math.max(nextRequestAt.get(scope) || 0, Date.now() + delayMs))
}

export function isScanRateLimitedError(error: unknown): boolean {
  const value = error as { status?: unknown; statusCode?: unknown; code?: unknown; resultCode?: unknown; message?: unknown; response?: { status?: unknown } }
  return value?.status === 429
    || value?.statusCode === 429
    || value?.response?.status === 429
    || String(value?.code || '').includes('429')
    || String(value?.resultCode || '').includes('429')
    || /(?:429|Too Many Requests|TooManyRequests|BlockException)/i.test(String(value?.message || error || ''))
}

export async function runRateLimitedScanRequest<T>(scope: string, request: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    await waitForRequestSlot(scope)
    try {
      return await request()
    } catch (error) {
      if (!isScanRateLimitedError(error) || attempt >= MAX_RATE_LIMIT_RETRIES) throw error
      const retryAfter = 2000 * Math.pow(2, attempt)
      deferAfterRateLimit(scope, retryAfter)
      await delay(retryAfter)
    }
  }
}

export async function *rateLimitScanPages<T>(scope: string, pages: AsyncIterable<T>): AsyncGenerator<T> {
  const iterator = pages[Symbol.asyncIterator]()
  while (true) {
    await waitForRequestSlot(scope)
    let page: IteratorResult<T>
    try {
      page = await iterator.next()
    } catch (error) {
      // Async generators cannot reliably resume after a failed next(). The caller can
      // restart this folder later; keep the shared scope cooled down for that retry.
      if (isScanRateLimitedError(error)) deferAfterRateLimit(scope, 2000)
      throw error
    }
    if (page.done) return
    yield page.value
  }
}

export async function *rateLimitSingleScanPage<T>(scope: string, request: () => Promise<T>): AsyncGenerator<T> {
  yield await runRateLimitedScanRequest(scope, request)
}

export function libraryScanRateLimitScope(userId: string, driveId: string): string {
  return `cloud:${userId}:${driveId}`
}
