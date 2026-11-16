import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * The two keys a connected app is given.
 *
 * The ingest key is what the app's deploy sends its routes with. The read key
 * is what the app's own dashboard reads usage with. They are different on
 * purpose and told apart by their prefix, so one presented where the other
 * belongs is turned away before any lookup.
 *
 * A key is found by its SHA-256, never by comparing the stored key against
 * whatever was sent, and the row found is then compared in constant time.
 */

const INGEST_PREFIX = 'shq_app_'
const READ_PREFIX = 'shq_read_'
const BODY = /^[\w-]{40,64}$/

function mint(prefix: string): string {
  return `${prefix}${randomBytes(32).toString('base64url')}`
}

export const newIngestKey = (): string => mint(INGEST_PREFIX)
export const newReadKey = (): string => mint(READ_PREFIX)

export function looksLikeIngestKey(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(INGEST_PREFIX) && BODY.test(value.slice(INGEST_PREFIX.length))
}

export function looksLikeReadKey(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(READ_PREFIX) && BODY.test(value.slice(READ_PREFIX.length))
}

export function hashKey(key: string): string {
  return createHash('sha256').update(`statushq-app-key:${key}`).digest('hex')
}

export function sameKey(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/** The key of a request's `Authorization: Bearer` header, or null. */
export function bearerKey(headers: { get: (name: string) => string | null }): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec((headers.get('authorization') ?? '').trim())
  return match?.[1] ?? null
}
