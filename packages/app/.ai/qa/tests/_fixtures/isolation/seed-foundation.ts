// foundation records of the cross-club isolation guard (#628): one Google identity linked to the adult member's
// account (social sign-in, #566), through the real OAuth round trip against the in-process Google fake. The link id and
// its lock token feed the `/api/foundation/identity` probes; the provider subject is a marker of the club.
import { expect, request as playwrightRequest } from '@playwright/test'
import { uniqueSuffix } from '../club'
import { startGoogleFake } from '../../foundation/identity/_fixtures/google-fake'
import { cleanHttp, roundTrip, sessionJar } from '../../foundation/identity/_fixtures/identity'
import type { ModuleSeed } from './seed'

type IdentityList = { items: Array<{ id: string; updatedAt: string }> }

export const seedFoundation: ModuleSeed = async ({ seeded, api }) => {
  const { refs } = seeded
  const subject = `google-it628-${seeded.label.toLowerCase()}${uniqueSuffix()}`
  const fake = await startGoogleFake()
  try {
    fake.next({ sub: subject, email: `${subject}@gmail.test` })
    const http = cleanHttp(playwrightRequest, String(process.env.BASE_URL))
    const { target } = await roundTrip(http, sessionJar(seeded.tokens.member))
    expect(target, `club ${seeded.label}: link the member's Google identity`).toBe(
      '/club/profile?identity=linked&provider=google',
    )
  } finally {
    await fake.stop()
  }
  const list = await api<IdentityList>('GET', '/api/foundation/identity/me', { token: seeded.tokens.member })
  const link = list.body?.items[0]
  expect(link, `club ${seeded.label}: the member's link`).toBeTruthy()
  refs.identityLink = String(link?.id)
  refs.identityLinkUpdatedAt = String(link?.updatedAt)
  seeded.markers.push(subject)
}
