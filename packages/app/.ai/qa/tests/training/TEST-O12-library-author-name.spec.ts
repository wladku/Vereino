import { expect, test } from '@playwright/test'
import { familyFor } from '../_fixtures/attendance'
import { call, createClub } from '../_fixtures/club'
import { ensureLibrary, ownOutline, publishOutline, readEntry, uniqueTopic } from '../_fixtures/library'
import { getMe, putMe } from '../_fixtures/members'

// Training outlines spec TEST-O12 (REQ-O14, AC-O11; glossary *Author credit*, DD-29; #685): an author without the name
// consent is credited by the club's name only; with the consent, publishing (again) shows "First L.", and a copy
// shared by another club credits the first author by name too. Withdrawing the consent removes the name from the
// author's entries and from the copies crediting them (a subscriber, after the commit).
test.describe.configure({ timeout: 300_000 })

test('TEST-O12 the author is named only with the name consent, and the name leaves on withdrawal', async ({
  request,
}) => {
  ensureLibrary()
  const clubA = await createClub(request, 'test-o12-a')
  const clubB = await createClub(request, 'test-o12-b')
  try {
    const familyA = await familyFor(request, clubA)
    const familyB = await familyFor(request, clubB)
    const coach = familyA.coach.token
    const topic = uniqueTopic('Autor')
    const outline = await ownOutline(request, coach, topic)

    // Without the consent: the club only.
    const shared = await publishOutline(request, coach, outline.id, { visibility: 'clubs', acceptTerms: true })
    expect(shared.status, JSON.stringify(shared.body)).toBe(201)
    const entryId = String(shared.body?.entryId)
    expect((await readEntry(request, familyB.coach.token, entryId)).body?.credit.authorName).toBeNull()

    // With the consent, publishing again names the author ("First L.").
    const me = await getMe(request, coach)
    expect(me.status, JSON.stringify(me.body)).toBe(200)
    const person = me.body?.person as { firstName: string; lastName: string; updatedAt: string }
    const given = await putMe(request, coach, { publishNameConsent: true }, person.updatedAt)
    expect(given.status, JSON.stringify(given.body)).toBe(200)
    const name = `${person.firstName.trim()} ${person.lastName.trim().charAt(0).toLocaleUpperCase()}.`
    const again = await publishOutline(request, coach, outline.id, { visibility: 'clubs' })
    expect(again.status, JSON.stringify(again.body)).toBe(200)
    expect((await readEntry(request, familyB.coach.token, entryId)).body?.credit.authorName).toBe(name)

    // Club B copies and shares it: the first author is credited by name.
    const copy = await call<{ id: string }>(
      request,
      'POST',
      `/api/training/library/${entryId}/copy`,
      familyB.coach.token,
    )
    expect(copy.status, JSON.stringify(copy.body)).toBe(201)
    const reshared = await publishOutline(request, familyB.coach.token, String(copy.body?.id), {
      visibility: 'clubs',
      acceptTerms: true,
    })
    expect(reshared.status, JSON.stringify(reshared.body)).toBe(201)
    const copyEntry = String(reshared.body?.entryId)
    const adapted = await readEntry(request, coach, copyEntry)
    expect(adapted.body?.credit.adaptedFrom).toMatchObject({ entryId, authorName: name })

    // The author withdraws the consent: the name leaves both entries.
    const current = await getMe(request, coach)
    const withdrawn = await putMe(request, coach, { publishNameConsent: false }, current.body?.person.updatedAt)
    expect(withdrawn.status, JSON.stringify(withdrawn.body)).toBe(200)
    await expect
      .poll(async () => (await readEntry(request, familyB.coach.token, entryId)).body?.credit.authorName, {
        timeout: 60_000,
      })
      .toBeNull()
    await expect
      .poll(
        async () =>
          ((await readEntry(request, coach, copyEntry)).body?.credit.adaptedFrom as { authorName?: string | null })
            ?.authorName,
        { timeout: 60_000 },
      )
      .toBeNull()
  } finally {
    await clubB.cleanup()
    await clubA.cleanup()
  }
})
