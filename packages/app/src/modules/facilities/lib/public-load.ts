// The load result of a public facility page (facilities spec REQ-014; #124, #289, #487), shared by the browser fetch
// and the server render so both tell the same states apart: a page (200), an unknown club or place (404
// `public_place_not_found`), a club that does not share its facility calendars (404 `public_places_disabled`), a month
// outside the readable range (400 `public_schedule_month_invalid`), and a failed request (null). A state with nothing
// to show keeps the club header the API sends while the club publishes its page (null otherwise). Pure.

export type PublicFacilitiesLoad<T, C> =
  | { status: 'ok'; page: T }
  | { status: 'not_found'; club: C | null }
  | { status: 'disabled'; club: C | null }
  | { status: 'month_invalid'; club: C | null }

/** A public API answer: the HTTP status and the JSON body. */
export type PublicFacilitiesAnswer = { ok: boolean; status: number; body: unknown }

function field(body: unknown, name: 'code' | 'club'): unknown {
  return body && typeof body === 'object' ? (body as Record<string, unknown>)[name] : undefined
}

/** The page state of an API answer; null for a failed request. */
export function publicFacilitiesLoadOf<T, C>(answer: PublicFacilitiesAnswer): PublicFacilitiesLoad<T, C> | null {
  if (answer.ok && answer.body) return { status: 'ok', page: answer.body as T }
  const club = (field(answer.body, 'club') as C | undefined) ?? null
  const code = field(answer.body, 'code')
  if (answer.status === 404) {
    return code === 'public_places_disabled' ? { status: 'disabled', club } : { status: 'not_found', club }
  }
  if (answer.status === 400 && code === 'public_schedule_month_invalid') return { status: 'month_invalid', club }
  return null
}
