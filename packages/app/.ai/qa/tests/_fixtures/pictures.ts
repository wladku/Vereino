// The pictures of a club event in integration tests (event photos spec phase 2, #872): uploads, marks, publication,
// the manager's event read, the guardian's image consent and the public read of P-T1. Every helper returns the status
// and body; the tests assert them.
import { expect, type APIRequestContext } from '@playwright/test'
import { familyFor } from './attendance'
import { call, createClub, OPTIMISTIC_LOCK_HEADER, uniqueSuffix, type Club } from './club'
import { makePublic, partFamily, readClubEvent } from './club-events'
import { getMe } from './members'
import { setConsents } from './people'
import { png, publish, type PublicationBlock } from './publication'

export type PictureState = 'draft' | 'unconfirmed' | 'waiting_for_consent' | 'event_not_public' | 'public'

export type Picture = {
  id: string
  kind: 'photo' | 'graphic'
  description: string
  position: number
  state: PictureState
  marks: { id: string; displayName: string }[]
  missingConsent: { id: string; displayName: string }[]
  missingConsentCount: number
  publishedAt: string | null
  url: string
  updatedAt: string
}

export type PublicPicture = { id: string; description: string; kind: 'photo' | 'graphic'; url: string }

type UploadFile = { name: string; mimeType: string; buffer: Buffer }

const BLOCKS: PublicationBlock[] = ['description_schedule', 'events']

/** A JPEG with an EXIF block that carries a GPS marker and an orientation, and a comment: what a phone would send. */
export function phoneJpeg(): UploadFile {
  const exifBody = Buffer.concat([
    Buffer.from('Exif\0\0', 'binary'),
    // Big-endian TIFF header, IFD0 at 8 with one entry: Orientation (0x0112) SHORT 1 = 6.
    Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08]),
    Buffer.from([0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00]),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
    Buffer.from('GPSLatitude 52.2297 SECRET-PITCH', 'binary'),
  ])
  const segment = (marker: number, body: Buffer) =>
    Buffer.concat([Buffer.from([0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff]), body])
  const scan = Buffer.from([0x00, 0x3f, 0x00, 0x12, 0x34, 0x56, 0xff, 0xd9])
  const buffer = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xe1, exifBody),
    segment(0xfe, Buffer.from('Comment SECRET-COMMENT', 'binary')),
    segment(0xdb, Buffer.alloc(65, 1)),
    Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00]),
    scan,
  ])
  return { name: 'IMG_Jas_Kowalski.jpg', mimeType: 'image/jpeg', buffer }
}

export function picturePath(eventId: string, fileId?: string, tail = ''): string {
  return `/api/activities/club-events/${eventId}/files${fileId ? `/${fileId}` : ''}${tail}`
}

/** Uploads a picture of `kind` as `token`. */
export async function uploadPicture(
  request: APIRequestContext,
  token: string,
  eventId: string,
  options: { kind?: 'photo' | 'graphic'; description?: string; file?: UploadFile } = {},
): Promise<{ status: number; body: (Partial<Picture> & { code?: string; error?: string }) | null }> {
  const response = await request.fetch(picturePath(eventId), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    multipart: {
      kind: options.kind ?? 'photo',
      description: options.description ?? `Picture ${uniqueSuffix()}`,
      file: options.file ?? png([10, 120, 200]),
    },
    timeout: 60_000,
  })
  return { status: response.status(), body: (await response.json().catch(() => null)) as Partial<Picture> | null }
}

/** Uploads a picture and returns its id (201 asserted). */
export async function pictureId(
  request: APIRequestContext,
  token: string,
  eventId: string,
  options: { kind?: 'photo' | 'graphic'; description?: string; file?: UploadFile } = {},
): Promise<string> {
  const uploaded = await uploadPicture(request, token, eventId, options)
  expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(201)
  return String(uploaded.body?.id)
}

/** The pictures of the event as `token` reads it (undefined when the caller does not manage it). */
export async function picturesOf(
  request: APIRequestContext,
  token: string,
  eventId: string,
): Promise<Picture[] | undefined> {
  const read = await readClubEvent(request, token, eventId)
  expect(read.status, JSON.stringify(read.body)).toBe(200)
  return (read.body as { pictures?: Picture[] } | null)?.pictures
}

export async function pictureOf(request: APIRequestContext, token: string, eventId: string, id: string) {
  const picture = (await picturesOf(request, token, eventId))?.find((entry) => entry.id === id)
  expect(picture, `picture ${id}`).toBeTruthy()
  return picture as Picture
}

/** A picture command with the picture's current lock token. */
export async function pictureCommand(
  request: APIRequestContext,
  token: string,
  eventId: string,
  id: string,
  action: 'people' | 'publish' | 'unpublish' | 'update',
  data: Record<string, unknown> = {},
  lockToken?: string,
) {
  const lock = lockToken ?? (await pictureOf(request, token, eventId, id)).updatedAt
  const tail = action === 'update' ? '' : `/${action}`
  return call<{ picture?: Picture; code?: string }>(
    request,
    action === 'people' || action === 'update' ? 'PUT' : 'POST',
    picturePath(eventId, id, tail),
    token,
    { data, headers: { [OPTIMISTIC_LOCK_HEADER]: lock } },
  )
}

/** Marks `personIds` on a picture and confirms (200 asserted). */
export async function markAndConfirm(
  request: APIRequestContext,
  token: string,
  eventId: string,
  id: string,
  personIds: string[],
) {
  const marked = await pictureCommand(request, token, eventId, id, 'people', { personIds, confirmed: true })
  expect(marked.status, JSON.stringify(marked.body)).toBe(200)
  return marked.body?.picture as Picture
}

/** The guardian's image consent decision for a ward on their own guardianship (200 asserted). */
export async function guardianImageConsent(
  request: APIRequestContext,
  guardianToken: string,
  wardId: string,
  granted: boolean,
) {
  const me = await getMe(request, guardianToken)
  const ward = (me.body?.wards as { personId: string; guardianship: { id: string; updatedAt: string } }[]).find(
    (entry) => entry.personId === wardId,
  )
  expect(ward, JSON.stringify(me.body)).toBeTruthy()
  const saved = await setConsents(
    request,
    guardianToken,
    String(ward?.guardianship.id),
    { image: granted },
    ward?.guardianship.updatedAt,
  )
  expect(saved.status, JSON.stringify(saved.body)).toBe(200)
}

/**
 * The scene of phase 2's tests: `familyFor`'s club with `partFamily`'s club event "PRZYKŁAD CUP 2026" (the Żaki part
 * concerns the guardian's two wards and the other family's child), made public, and the club page published with its
 * `events` block under a fresh slug.
 */
export async function pictureScene(request: APIRequestContext, label: string) {
  const club = await createClub(request, label)
  const family = await familyFor(request, club)
  const parts = await partFamily(request, club, family)
  const eventSlug = await makePublic(request, club.adminToken, parts.eventId)
  const clubSlug = `${label.slice(0, 12)}-${uniqueSuffix()}`
  await publish(request, club.adminToken, clubSlug, BLOCKS, { shortName: 'Klub zdjęć' })
  return {
    club,
    family,
    parts,
    eventId: parts.eventId,
    coordinator: family.academyCoordinator.token,
    clubSlug,
    eventSlug,
    publicPath: `/api/club_core/public/${clubSlug}/events/${eventSlug}`,
  }
}

export type PictureScene = Awaited<ReturnType<typeof pictureScene>>

export async function cleanup(club: Club): Promise<void> {
  await club.cleanup()
}
