// The load result of a public club page (club spec DD-23; #29, #487), shared by the browser fetch and the server render
// so both tell the same states apart: a page (200), a club that does not publish it or its events (404
// `public_page_disabled` / `public_events_disabled`), anything else the API answers 404 for (nothing about any club),
// and a failed request (null: the page shows its error state, or the server render leaves the read to the browser).
// Also the plain-text preview a page's Open Graph description carries. Pure.

export type PublicLoad<T> = { status: 'ok'; page: T } | { status: 'not_found' } | { status: 'disabled' }

/** A public API answer: the HTTP status and the JSON body. */
export type PublicAnswer = { ok: boolean; status: number; body: unknown }

const DISABLED_CODES = new Set(['public_page_disabled', 'public_events_disabled'])

function codeOf(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const code = (body as { code?: unknown }).code
  return typeof code === 'string' ? code : null
}

/** The page state of an API answer; null for a failed request. */
export function publicLoadOf<T>(answer: PublicAnswer): PublicLoad<T> | null {
  if (answer.ok && answer.body) return { status: 'ok', page: answer.body as T }
  if (answer.status !== 404) return null
  return DISABLED_CODES.has(codeOf(answer.body) ?? '') ? { status: 'disabled' } : { status: 'not_found' }
}

/** The longest Open Graph description: what link previews show before cutting it themselves. */
export const PREVIEW_TEXT_MAX = 200

/**
 * A text as one line of at most `max` characters, cut at the last word boundary with "…"; null for an empty text.
 * Only public page text goes in (a club's or section's description, an event's description), never personal data.
 */
export function previewText(text: string | null | undefined, max: number = PREVIEW_TEXT_MAX): string | null {
  const line = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!line) return null
  if (line.length <= max) return line
  const cut = line.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}…`
}
