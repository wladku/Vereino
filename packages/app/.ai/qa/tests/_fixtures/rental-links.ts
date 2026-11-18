// The renter's e-mails and cancellation link (#286, facilities parity spec REQ-R17, J-R06, TEST-R17): the sessionless
// preview and cancel calls, the link out of a captured e-mail, and the database facts a test checks or sets — the
// stored hash, the wiped delivery secret, a passed cancellation deadline or link expiry — never filtering an
// encrypted column in SQL.
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { awaitEmails } from './communication'
import { publicCall, type PublicResult } from './declaration-links'
import type { CapturedMessage } from './messaging'

export const CANCEL_PREVIEW_API = '/api/facilities/public/rentals/cancel/preview'
export const CANCEL_API = '/api/facilities/public/rentals/cancel'

export function previewCancel(token: string): Promise<PublicResult> {
  return publicCall('POST', CANCEL_PREVIEW_API, { token })
}

export function cancelByLink(token: string, confirm: unknown = true): Promise<PublicResult> {
  return publicCall('POST', CANCEL_API, { token, confirm })
}

/** The `/p/<club>/rentals/cancel/<token>` link of a captured e-mail, or null when it carries none. */
export function cancelLinkOf(message: CapturedMessage): string | null {
  return message.links.find((href) => href.includes('/rentals/cancel/')) ?? null
}

/** The raw token of the cancellation link in a captured e-mail. */
export function cancelTokenOf(message: CapturedMessage): string {
  const link = cancelLinkOf(message)
  if (!link) throw new Error(`[internal] no cancellation link in "${message.subject}"`)
  return decodeURIComponent(new URL(link).pathname.split('/').pop() ?? '')
}

/** Waits for the `count`-th e-mail with `subject` to `address` and returns it. */
export async function latestEmail(address: string, subject: string, count = 1): Promise<CapturedMessage> {
  const messages = await awaitEmails(address, subject, count)
  return messages[messages.length - 1]
}

/** The rental's link rows: purpose, whether spent, its expiry and its hash (never the raw token). */
export async function rentalLinkRows(rentalId: string) {
  return withClient(async (client) => {
    const { rows } = await client.query<{
      purpose: string
      used_at: Date | null
      expires_at: Date
      token_hash: string
    }>(`select purpose, used_at, expires_at, token_hash from facilities_rental_links where rental_id = $1`, [rentalId])
    return rows
  })
}

/** Moves the rental's free cancellation deadline one minute into the past (the 24 h a test cannot wait for). */
export async function passCancellationDeadline(rentalId: string): Promise<void> {
  await withClient(async (client) => {
    await client.query(
      `update facilities_rentals set cancellation_deadline = now() - interval '1 minute' where id = $1`,
      [rentalId],
    )
  })
}

/** Ends the rental's cancellation link one minute ago (a link opened after the rental started). */
export async function expireRentalLink(rentalId: string): Promise<void> {
  await withClient(async (client) => {
    await client.query(
      `update facilities_rental_links set expires_at = now() - interval '1 minute' where rental_id = $1`,
      [rentalId],
    )
  })
}

/** The deliveries of every dispatch whose source is the rental: template, status and whether a secret remains. */
export async function rentalDeliveries(rentalId: string) {
  return withClient(async (client) => {
    const { rows } = await client.query<{ template_id: string; status: string; has_secret: boolean }>(
      `select p.template_id, d.status, d.secret_params is not null as has_secret
         from foundation_deliveries d join foundation_dispatches p on p.id = d.dispatch_id
        where p.source_id = $1 order by p.created_at`,
      [rentalId],
    )
    return rows
  })
}
