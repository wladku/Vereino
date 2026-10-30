import { expect, test } from '@playwright/test'
import {
  calendarItems,
  entryOf,
  familyFor,
  firstSession,
  readCalendarItem,
  weeklySeries,
} from '../_fixtures/attendance'
import { createClub } from '../_fixtures/club'
import { getMe, putMe, updateClubSettings } from '../_fixtures/members'

// Issue #32, club spec TEST-055 (REQ-006, R15, A09), presence part, and phase 2 step 10: which other children a guardian
// sees on a session. Under `show_called_up_children = none` the calendar carries no list at all; under `consented` it
// carries the first and last names of the other called-up children whose guardian gave `share_presence_with_guardians`
// — never the guardian's own wards, and a guardian's own consent reveals nothing to themself. The settings part
// (`own_account_min_age`) is `people/TEST-055-account-threshold-settings.spec.ts`; the checkout part belongs to phase 4.
test.describe.configure({ timeout: 300_000 })

test('TEST-055 presence part: no list under none; under consented an empty list until the other guardian consents, then that child only, never own wards', async ({
  request,
}) => {
  const club = await createClub(request, 'test-055-presence')
  try {
    const family = await familyFor(request, club)
    const training = await weeklySeries(request, club, family.academyCoordinator.token, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Trening Żaków',
      type: 'training',
      weekday: 'TU',
      start: '17:00',
      end: '18:30',
    })
    const session = firstSession(training.sessions)
    const day = String(session.occurrenceDate)
    const window = `from=${day}&to=${day}`
    const ours = async () =>
      entryOf(await calendarItems(request, family.guardian.token, `${window}&as=guardian`), session.id)
    const theirs = async () =>
      entryOf(await calendarItems(request, family.other.guardian.token, `${window}&as=guardian`), session.id)

    // The default `none`: no `calledUpChildren` key for anybody.
    expect(await ours()).not.toHaveProperty('calledUpChildren')
    expect(await theirs()).not.toHaveProperty('calledUpChildren')

    // `consented`: the list exists and is empty while no guardian consented.
    const consented = await updateClubSettings(request, club.adminToken, { showCalledUpChildren: 'consented' })
    expect(consented.status, JSON.stringify(consented.body)).toBe(200)
    expect((await ours()).calledUpChildren).toEqual([])
    expect((await theirs()).calledUpChildren).toEqual([])
    const item = await readCalendarItem(request, family.guardian.token, session.id, 'as=guardian')
    expect(item.status, JSON.stringify(item.body)).toBe(200)
    expect(item.body?.calledUpChildren).toEqual([])

    // Our guardian consents: the other family now sees our two wards; we still see nobody (our consent is not theirs).
    const ourProfile = await getMe(request, family.guardian.token)
    expect(ourProfile.status, JSON.stringify(ourProfile.body)).toBe(200)
    expect(ourProfile.body?.person.consents.sharePresenceWithGuardians.granted).toBe(false)
    const ourConsent = await putMe(
      request,
      family.guardian.token,
      { sharePresenceWithGuardians: true },
      ourProfile.body?.person.updatedAt,
    )
    expect(ourConsent.status, JSON.stringify(ourConsent.body)).toBe(200)
    expect(ourConsent.body?.person?.consents.sharePresenceWithGuardians.granted).toBe(true)
    expect((await ours()).calledUpChildren).toEqual([])
    expect((await theirs()).calledUpChildren).toEqual([
      { personId: family.younger.personId, firstName: family.younger.firstName, lastName: family.younger.lastName },
      { personId: family.elder.personId, firstName: family.elder.firstName, lastName: family.elder.lastName },
    ])

    // The other guardian consents: we see their child's first and last name, and never our own wards in that list.
    const theirProfile = await getMe(request, family.other.guardian.token)
    const theirConsent = await putMe(
      request,
      family.other.guardian.token,
      { sharePresenceWithGuardians: true },
      theirProfile.body?.person.updatedAt,
    )
    expect(theirConsent.status, JSON.stringify(theirConsent.body)).toBe(200)
    const revealed = await ours()
    expect(revealed.calledUpChildren).toEqual([
      {
        personId: family.other.child.personId,
        firstName: family.other.child.firstName,
        lastName: family.other.child.lastName,
      },
    ])
    expect(revealed.persons.map((person) => person.personId).sort()).toEqual(
      [family.younger.personId, family.elder.personId].sort(),
    )
    // Only names travel: no birth date, declaration or contact data about the other child.
    expect(Object.keys(revealed.calledUpChildren?.[0] ?? {}).sort()).toEqual(['firstName', 'lastName', 'personId'])
    const theirItem = await readCalendarItem(request, family.other.guardian.token, session.id, 'as=guardian')
    expect(theirItem.body?.calledUpChildren?.map((child) => child.personId).sort()).toEqual(
      [family.younger.personId, family.elder.personId].sort(),
    )

    // The 16-year-old's own view never lists other children; staff views do not carry the list either.
    const selfEntry = entryOf(await calendarItems(request, family.elder.token, `${window}&as=self`), session.id)
    expect(selfEntry).not.toHaveProperty('calledUpChildren')
    const coachEntry = entryOf(await calendarItems(request, family.coach.token, `${window}&as=coach`), session.id)
    expect(coachEntry).not.toHaveProperty('calledUpChildren')

    // Back to `none`: the list disappears although the consents stand.
    const hidden = await updateClubSettings(request, club.adminToken, { showCalledUpChildren: 'none' })
    expect(hidden.status, JSON.stringify(hidden.body)).toBe(200)
    expect(await ours()).not.toHaveProperty('calledUpChildren')
  } finally {
    await club.cleanup()
  }
})
