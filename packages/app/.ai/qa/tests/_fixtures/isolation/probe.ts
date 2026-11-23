// The probe engine of the cross-club isolation guard (#628, E22-S02; D-034). It runs the route inventory
// (`inventory/<module>.json`, checked statically by `yarn route-isolation:check`) against two seeded clubs:
//
// - `read`: each listed role of club A calls the route (its `$A:` refs and any `$B:` filter values substituted). The
//   answer must hold none of club B's markers (ids, e-mail addresses, slugs), must not be a 5xx, and — when the read
//   could already run before club B was seeded — must be the same before and after: the same ids and the same
//   totals/counts, so club B's records change no count club A sees.
// - `foreign-id` / `foreign-ref`: each role of club A addresses a record of club B (in the path, the query or the
//   body). The status must equal the status of the same call with a random id that exists nowhere, so the answer does
//   not tell whether club B's record exists; club A's administrator must get the probe's `expect` (default 404; for a
//   `foreign-ref`, which names club B's record in a filter or a body field, 404 or 422). A
//   2xx is a leak; so is any club B marker in the answer other than the ids the caller sent.
// - `public`: the same without a session (club A's slug with club B's resource, for example).
// - `exempt`: not called; the inventory says why.
import { request as playwrightRequest, type APIRequestContext, type APIResponse } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { APP_ROOT } from '../club'
import { CLUB_ROLES, type ProbeRole, type Refs, type SeededClub } from './seed'

export type ProbeKind = 'read' | 'foreign-id' | 'foreign-ref' | 'public' | 'exempt'

export type Probe = {
  probe: ProbeKind
  why?: string
  params?: Record<string, string>
  query?: Record<string, string | string[]>
  body?: unknown
  headers?: Record<string, string>
  expect?: number[]
  roles?: ProbeRole[]
  stable?: boolean
}

export type InventoryEntry = { route: string; method: string; probe: Probe; index: number }

const INVENTORY_DIR = path.join(APP_ROOT, '.ai', 'qa', 'tests', '_fixtures', 'isolation', 'inventory')
const REFERENCE = /^\$(A|B):([a-zA-Z][a-zA-Z0-9]*)$/
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

/** Whether an inventory file or seed key (`payments`, `payments-orders`) belongs to one of the given modules. */
export const inModules = (key: string, modules: readonly string[]): boolean =>
  modules.some((module) => key === module || key.startsWith(`${module}-`))

/** The inventory files (all, or the given modules), flattened to one entry per probe. */
export function loadInventory(modules: readonly string[] | null): InventoryEntry[] {
  const entries: InventoryEntry[] = []
  for (const name of fs
    .readdirSync(INVENTORY_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort()) {
    if (modules && !inModules(name.replace(/\.json$/, ''), modules)) continue
    const parsed = JSON.parse(fs.readFileSync(path.join(INVENTORY_DIR, name), 'utf8')) as {
      routes: Record<string, Record<string, Probe | Probe[]>>
    }
    for (const [route, methods] of Object.entries(parsed.routes)) {
      for (const [method, value] of Object.entries(methods)) {
        ;[value].flat().forEach((probe, index) => entries.push({ route, method, probe, index }))
      }
    }
  }
  return entries
}

export const entryLabel = (entry: InventoryEntry): string =>
  `${entry.method} ${entry.route}${entry.index > 0 ? ` #${String(entry.index + 1)}` : ''} (${entry.probe.probe})`

type Clubs = { A: SeededClub; B: SeededClub }

/** Replaces every `$A:`/`$B:` reference in `value`; `foreign` maps a club B value to its stand-in (random) value. */
function substitute(value: unknown, clubs: Clubs, used: Set<string>, foreign?: (value: string) => string): unknown {
  if (typeof value === 'string') {
    const match = REFERENCE.exec(value)
    if (!match) return value
    const club = clubs[match[1] as 'A' | 'B']
    const resolved = club.refs[match[2]]
    if (resolved === undefined) throw new Error(`[internal] club ${match[1]} has no seeded ref "${match[2]}"`)
    if (match[1] === 'B') {
      const sent = foreign ? foreign(resolved) : resolved
      used.add(sent)
      return sent
    }
    return resolved
  }
  if (Array.isArray(value)) return value.map((item) => substitute(item, clubs, used, foreign))
  if (value !== null && typeof value === 'object') {
    if ('$file' in value) return value
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, substitute(item, clubs, used, foreign)]))
  }
  return value
}

/** A value of the same shape that exists nowhere (a fresh UUID for a UUID, a random token otherwise). */
function standIn(): (value: string) => string {
  const memo = new Map<string, string>()
  return (value) => {
    let replaced = memo.get(value)
    if (!replaced) {
      replaced = /^[0-9a-f-]{36}$/i.test(value) ? randomUUID() : `nx${randomUUID().replace(/-/g, '').slice(0, 20)}`
      memo.set(value, replaced)
    }
    return replaced
  }
}

type BuiltRequest = {
  url: string
  data?: unknown
  headers: Record<string, string>
  multipart?: Record<string, unknown>
}

function buildRequest(entry: InventoryEntry, clubs: Clubs, used: Set<string>, foreign?: (value: string) => string) {
  const { probe } = entry
  let url = entry.route
  const params = substitute(probe.params ?? {}, clubs, used, foreign) as Record<string, string>
  for (const [name, value] of Object.entries(params)) url = url.replace(`[${name}]`, encodeURIComponent(value))
  const query = substitute(probe.query ?? {}, clubs, used, foreign) as Record<string, string | string[]>
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) for (const item of [value].flat()) search.append(key, item)
  if (search.size > 0) url = `${url}?${search.toString()}`
  const headers = substitute(probe.headers ?? {}, clubs, used, foreign) as Record<string, string>
  const body = substitute(probe.body, clubs, used, foreign)
  const built: BuiltRequest = { url, headers }
  if (body !== null && typeof body === 'object' && '$multipart' in body) {
    built.multipart = (body as { $multipart: Record<string, unknown> }).$multipart
  } else if (body !== undefined) built.data = body
  return built
}

const FILES: Record<string, { name: string; mimeType: string; buffer: Buffer }> = {
  pdf: {
    name: 'document.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n'),
  },
  csv: { name: 'rows.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b\n1,2\n') },
  png: {
    name: 'image.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    ),
  },
}

type UploadFile = { name: string; mimeType: string; buffer: Buffer }

function multipartOf(fields: Record<string, unknown>): Record<string, string | UploadFile> {
  const form: Record<string, string | UploadFile> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value !== null && typeof value === 'object' && '$file' in value) {
      form[key] = FILES[(value as { $file: string }).$file]
    } else form[key] = typeof value === 'string' ? value : JSON.stringify(value)
  }
  return form
}

export type Answer = { status: number; text: string }

let guest: APIRequestContext | null = null

async function send(
  request: APIRequestContext,
  method: string,
  built: BuiltRequest,
  token: string | null,
): Promise<Answer> {
  const context = token ? request : (guest ??= await playwrightRequest.newContext({ baseURL: process.env.BASE_URL }))
  const headers: Record<string, string> = { ...built.headers }
  if (token) headers.Authorization = `Bearer ${token}`
  let response: APIResponse
  const base = process.env.BASE_URL ?? ''
  if (built.multipart) {
    response = await context.fetch(`${base}${built.url}`, {
      method,
      headers,
      multipart: multipartOf(built.multipart),
      timeout: 60_000,
    })
  } else {
    if (built.data !== undefined) headers['Content-Type'] = 'application/json'
    response = await context.fetch(`${base}${built.url}`, { method, headers, data: built.data, timeout: 60_000 })
  }
  const bytes = await response.body()
  return { status: response.status(), text: bytes.toString('utf8') }
}

export async function disposeGuest(): Promise<void> {
  await guest?.dispose()
  guest = null
}

function rolesOf(probe: Probe): ProbeRole[] {
  if (probe.roles) return probe.roles
  if (probe.probe === 'public') return ['anonymous']
  return [...CLUB_ROLES]
}

/** The role whose status must be the probe's `expect`: the administrator, else the first role the probe runs as. */
function strictRoleOf(probe: Probe): ProbeRole {
  const roles = rolesOf(probe)
  return roles.includes('admin') ? 'admin' : roles[0]
}

function tokenOf(club: SeededClub, role: ProbeRole): string | null {
  return role === 'anonymous' ? null : club.tokens[role]
}

/** The ids and the totals/counts of an answer: what club B's records must not change. */
export function fingerprint(text: string): string {
  const ids = [...new Set(text.match(UUID) ?? [])].map((id) => id.toLowerCase()).sort()
  const counts: string[] = []
  try {
    const walk = (value: unknown, key: string): void => {
      if (typeof value === 'number' && /total|count/i.test(key)) counts.push(`${key}=${String(value)}`)
      else if (Array.isArray(value)) {
        for (const item of value) walk(item, key)
      } else if (value !== null && typeof value === 'object') {
        for (const [child, item] of Object.entries(value)) walk(item, child)
      }
    }
    walk(JSON.parse(text), '')
  } catch {
    // not JSON (a CSV or a PDF): the ids alone
  }
  return JSON.stringify({ ids, counts: counts.sort() })
}

/** Club B's markers: its seeded ref values and response ids, its e-mails and slugs, minus anything club A also has. */
export function leakMarkers(clubs: Clubs, seenByA: readonly string[]): string[] {
  const candidates = new Set<string>()
  for (const value of Object.values(clubs.B.refs)) candidates.add(value)
  for (const body of clubs.B.responses)
    for (const id of JSON.stringify(body ?? null).match(UUID) ?? []) candidates.add(id)
  for (const marker of clubs.B.markers) candidates.add(marker)
  const knownToA = [...Object.values(clubs.A.refs), ...clubs.A.markers, JSON.stringify(clubs.A.responses), ...seenByA]
    .join('\n')
    .toLowerCase()
  return [...candidates].filter(
    (value) => value.length >= 8 && value !== clubs.A.refs.tenant && !knownToA.includes(value.toLowerCase()),
  )
}

function leaksIn(text: string, markers: readonly string[], allowed: Set<string>): string[] {
  const lower = text.toLowerCase()
  return markers.filter((marker) => !allowed.has(marker) && lower.includes(marker.toLowerCase()))
}

export type ReadSnapshot = Map<string, Answer>

const snapshotKey = (entry: InventoryEntry, role: ProbeRole) => `${entryLabel(entry)} as ${role}`

/** Whether a read probe needs club B (it filters by a club B value) and so cannot run before club B exists. */
export const needsClubB = (entry: InventoryEntry): boolean =>
  JSON.stringify([entry.probe.params, entry.probe.query, entry.probe.body, entry.probe.headers]).includes('"$B:')

/** Runs the read probes that need only club A and keeps their answers. */
export async function snapshotReads(
  request: APIRequestContext,
  entries: readonly InventoryEntry[],
  A: SeededClub,
): Promise<ReadSnapshot> {
  const snapshot: ReadSnapshot = new Map()
  const clubs: Clubs = { A, B: A }
  for (const entry of entries) {
    if (entry.probe.probe !== 'read' || needsClubB(entry)) continue
    for (const role of rolesOf(entry.probe)) {
      const built = buildRequest(entry, clubs, new Set())
      snapshot.set(snapshotKey(entry, role), await send(request, entry.method, built, tokenOf(A, role)))
    }
  }
  return snapshot
}

const truncate = (text: string) => (text.length > 300 ? `${text.slice(0, 300)}…` : text)

/** Runs every probe after both clubs are seeded; returns one line per problem. */
export async function runProbes(
  request: APIRequestContext,
  entries: readonly InventoryEntry[],
  clubs: Clubs,
  snapshot: ReadSnapshot,
): Promise<{ problems: string[]; calls: number }> {
  const problems: string[] = []
  const markers = leakMarkers(
    clubs,
    [...snapshot.values()].map((answer) => answer.text),
  )
  let calls = 0
  // Reads first, then the probes that address club B (they may change data when they leak).
  const ordered = [...entries].sort(
    (left, right) => Number(left.probe.probe !== 'read') - Number(right.probe.probe !== 'read'),
  )
  for (const entry of ordered) {
    const { probe } = entry
    if (probe.probe === 'exempt') continue
    const label = entryLabel(entry)
    for (const role of rolesOf(probe)) {
      const token = tokenOf(clubs.A, role)
      const used = new Set<string>()
      let built: BuiltRequest
      try {
        built = buildRequest(entry, clubs, used)
      } catch (error) {
        problems.push(`${label}: ${error instanceof Error ? error.message : String(error)}`)
        break
      }
      const answer = await send(request, entry.method, built, token)
      calls += 1
      const where = `${label} as ${role} (${built.url})`
      if (answer.status >= 500) problems.push(`${where}: ${String(answer.status)} ${truncate(answer.text)}`)
      const leaks = leaksIn(answer.text, markers, used)
      if (leaks.length > 0) {
        problems.push(`${where}: answered ${String(answer.status)} with club B data ${leaks.slice(0, 5).join(', ')}`)
      }
      if (probe.probe === 'read') {
        const before = snapshot.get(snapshotKey(entry, role))
        if (before && probe.stable !== false && before.status === answer.status && answer.status < 300) {
          if (fingerprint(before.text) !== fingerprint(answer.text)) {
            problems.push(
              `${where}: the answer changed after club B was seeded (before ${fingerprint(before.text)}, after ${fingerprint(answer.text)})`,
            )
          }
        }
        continue
      }
      if (answer.status < 300) {
        problems.push(`${where}: club B's record answered ${String(answer.status)} ${truncate(answer.text)}`)
        continue
      }
      const baseline = await send(request, entry.method, buildRequest(entry, clubs, new Set(), standIn()), token)
      calls += 1
      if (baseline.status !== answer.status) {
        problems.push(
          `${where}: club B's record answered ${String(answer.status)} but a record that exists nowhere answered ${String(baseline.status)} (existence leaks)`,
        )
      }
      if (role === strictRoleOf(probe)) {
        const expected = probe.expect ?? (probe.probe === 'foreign-ref' ? [404, 422] : [404])
        if (!expected.includes(answer.status)) {
          problems.push(
            `${where}: expected ${expected.join('/')}, got ${String(answer.status)} ${truncate(answer.text)}`,
          )
        }
      }
    }
  }
  return { problems, calls }
}

export type { Refs }
