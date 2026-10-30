// Helpers of the public page and logo tests (club spec TEST-037, TEST-040; issue #29): publication settings, the
// section's public fields, logo and material uploads (multipart, with the lock token), sessionless public reads and
// small generated files — a real 1×1 PNG in a given colour, an SVG, an oversized file and a PDF.
import { deflateSync } from 'node:zlib'
import { expect, request as playwrightRequest, type APIRequestContext, type APIResponse } from '@playwright/test'
import { OPTIMISTIC_LOCK_HEADER, call } from './club'

export const PUBLICATION_BLOCKS = [
  'description_schedule',
  'conditions',
  'prices',
  'coaches',
  'materials',
  'contact',
  'places_calendar',
  'online_requests',
] as const

export type PublicationBlock = (typeof PUBLICATION_BLOCKS)[number]

export type Settings = {
  publicSlug: string | null
  publicDescription: string | null
  contactPhone: string | null
  logoAttachmentId: string | null
  logoUrl: string | null
  publication: { enabled: boolean; blocks: Record<PublicationBlock, boolean> }
  updatedAt: string | null
  code?: string
}

export type PublicLogo = { url: string | null; source: 'section' | 'club' | 'initial'; initial: string }

export type PublicClubPage = {
  club: { name: string; slug: string; description: string | null; logo: PublicLogo; contact: { phone: string } | null }
  sections: { name: string; slug: string; logo: PublicLogo }[]
  blocks: Record<string, unknown>
}

export type PublicSectionPage = {
  club: { name: string; slug: string; logo: PublicLogo }
  section: { name: string; slug: string; logo: PublicLogo }
  blocks: Record<string, unknown> & {
    description?: { text: string }
    conditions?: { text: string }
    materials?: { items: { id: string; title: string; url: string; mimeType: string }[] }
    contact?: { name: string | null; email: string | null; phone: string | null }
  }
}

export async function getSettings(request: APIRequestContext, token: string): Promise<Settings> {
  const result = await call<Settings>(request, 'GET', '/api/club_core/settings', token)
  expect(result.status, JSON.stringify(result.body)).toBe(200)
  return result.body as Settings
}

/** `PUT /api/club_core/settings` with the current lock token. */
export async function putSettings(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  const current = await getSettings(request, token)
  return call<Settings>(request, 'PUT', '/api/club_core/settings', token, {
    data,
    headers: current.updatedAt ? { [OPTIMISTIC_LOCK_HEADER]: current.updatedAt } : {},
  })
}

/** Publishes the club page under `slug` with exactly the given blocks on. */
export async function publish(
  request: APIRequestContext,
  token: string,
  slug: string,
  blocks: readonly PublicationBlock[],
  extra: Record<string, unknown> = {},
): Promise<Settings> {
  const result = await putSettings(request, token, {
    publicSlug: slug,
    publication: {
      enabled: true,
      blocks: Object.fromEntries(PUBLICATION_BLOCKS.map((block) => [block, blocks.includes(block)])),
    },
    ...extra,
  })
  expect(result.status, JSON.stringify(result.body)).toBe(200)
  return result.body as Settings
}

export type SectionView = {
  id: string
  name: string | null
  isPublic: boolean
  publicSlug: string | null
  logoAttachmentId: string | null
  updatedAt: string | null
}

export async function getSection(request: APIRequestContext, token: string, id: string): Promise<SectionView> {
  const result = await call<{ items?: SectionView[] }>(request, 'GET', `/api/club_core/sections?ids=${id}`, token)
  expect(result.status).toBe(200)
  const item = result.body?.items?.find((row) => row.id === id)
  if (!item) throw new Error(`[internal] section ${id} is not visible`)
  return item
}

/** `PUT /api/club_core/sections/{id}/public` with the given lock token (default: the section's current one). */
export async function putSectionPublic(
  request: APIRequestContext,
  token: string,
  id: string,
  data: Record<string, unknown>,
  lockToken?: string | null,
) {
  const lock = lockToken === undefined ? (await getSection(request, token, id)).updatedAt : lockToken
  return call<{ updatedAt?: string; code?: string }>(request, 'PUT', `/api/club_core/sections/${id}/public`, token, {
    data,
    headers: lock ? { [OPTIMISTIC_LOCK_HEADER]: lock } : {},
  })
}

export type UploadFile = { name: string; mimeType: string; buffer: Buffer }

/** A multipart upload with the bearer token and an optional lock token. */
export async function upload(
  request: APIRequestContext,
  token: string,
  path: string,
  file: UploadFile,
  fields: Record<string, string> = {},
  lockToken?: string | null,
): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const response = await request.fetch(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, ...(lockToken ? { [OPTIMISTIC_LOCK_HEADER]: lockToken } : {}) },
    multipart: { ...fields, file },
    timeout: 60_000,
  })
  return { status: response.status(), body: await jsonOrNull(response) }
}

export async function removeLogo(request: APIRequestContext, token: string, path: string, lockToken?: string | null) {
  return call(request, 'DELETE', path, token, {
    headers: lockToken ? { [OPTIMISTIC_LOCK_HEADER]: lockToken } : {},
  })
}

async function jsonOrNull(response: APIResponse): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * A sessionless `GET`: a fresh request context without the cookies the test's `request` collected when it signed
 * in, and without a token. Returns the status, the JSON body (or null) and the raw bytes. The first argument is kept
 * for call-site symmetry and is not used.
 */
export async function publicGet(
  _request: APIRequestContext,
  path: string,
): Promise<{ status: number; body: Record<string, unknown> | null; bytes: Buffer; headers: Record<string, string> }> {
  const guest = await playwrightRequest.newContext({ baseURL: process.env.BASE_URL || 'http://localhost:3000' })
  let response: APIResponse
  let bytes: Buffer
  try {
    response = await guest.fetch(path, { method: 'GET' })
    bytes = await response.body()
  } finally {
    await guest.dispose()
  }
  let body: Record<string, unknown> | null = null
  try {
    body = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>
  } catch {
    body = null
  }
  return { status: response.status(), body, bytes, headers: response.headers() }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/** A valid square PNG of one colour (`[r, g, b]`), `size` pixels wide. */
export function png([r, g, b]: [number, number, number], size = 8): UploadFile {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // colour type: RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())])
  const raw = Buffer.concat(Array.from({ length: size }, () => row))
  const buffer = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
  return { name: 'logo.png', mimeType: 'image/png', buffer }
}

export const SVG_FILE: UploadFile = {
  name: 'logo.svg',
  mimeType: 'image/svg+xml',
  buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
}

/** An SVG renamed to `.png`: refused by its bytes, not its name. */
export const SVG_AS_PNG: UploadFile = { ...SVG_FILE, name: 'logo.png', mimeType: 'image/png' }

/** A PNG signature followed by 3 MB of zeros: over the 2 MB logo limit. */
export function bigPng(): UploadFile {
  const buffer = Buffer.alloc(3 * 1024 * 1024)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer)
  return { name: 'big.png', mimeType: 'image/png', buffer }
}

/** A small PDF. */
export function pdf(name: string): UploadFile {
  const text = [
    '%PDF-1.4',
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj',
    'trailer << /Root 1 0 R >>',
    '%%EOF',
  ].join('\n')
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(text, 'latin1') }
}
