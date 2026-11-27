import { expect, test } from '@playwright/test'
import { readNotifications } from '../_fixtures/activities'
import {
  guardianImageConsent,
  markAndConfirm,
  pictureCommand,
  pictureId,
  pictureOf,
  pictureScene,
  type PublicPicture,
} from '../_fixtures/pictures'
import { publicGet } from '../_fixtures/publication'

// Event photos spec phase 2 (#872; REQ-I05, REQ-I09, BR-I01, BR-I02, DD-I01, DD-I10, AC-I06): TEST-I07 — two
// published photos of "PRZYKŁAD CUP 2026" mark the younger ward, whose guardian gave the image consent, and a published
// graphic shows nobody. When the guardian withdraws the consent, the next public read drops both photos from the JSON
// and their file URLs answer 404, while the graphic stays; the staff read shows them "waiting for consent"; the
// academy coordinator, a manager of the event, gets exactly one `activities.club_event.pictures_held_back`
// notification for the event, with the event's name and the count 2 and never the child's name. When the guardian
// gives the consent again, the photos return without anyone republishing them.
test.describe.configure({ timeout: 420_000 })

const HELD_BACK = 'activities.club_event.pictures_held_back'

test('TEST-I07 a guardian’s withdrawal hides the photos at the next read and the managers get one notice per event', async ({
  request,
}) => {
  const scene = await pictureScene(request, 'test-i07')
  const { club, family, eventId, coordinator } = scene
  try {
    await guardianImageConsent(request, family.guardian.token, family.younger.personId, true)
    const photos: string[] = []
    for (const description of ['Finał Żaków', 'Dekoracja Żaków']) {
      const id = await pictureId(request, coordinator, eventId, { description })
      await markAndConfirm(request, coordinator, eventId, id, [family.younger.personId])
      const published = await pictureCommand(request, coordinator, eventId, id, 'publish')
      expect(published.status, JSON.stringify(published.body)).toBe(200)
      photos.push(id)
    }
    const graphic = await pictureId(request, coordinator, eventId, { kind: 'graphic', description: 'Tablica wyników' })
    expect(
      (await pictureCommand(request, coordinator, eventId, graphic, 'people', { personIds: [], confirmed: true }))
        .status,
    ).toBe(200)
    expect((await pictureCommand(request, coordinator, eventId, graphic, 'publish')).status).toBe(200)
    const publicIds = async () => {
      const read = await publicGet(request, scene.publicPath)
      expect(read.status, JSON.stringify(read.body)).toBe(200)
      return (read.body?.event as { pictures: PublicPicture[] }).pictures.map((picture) => picture.id)
    }
    expect(await publicIds()).toEqual([...photos, graphic])
    const before = await readNotifications(request, coordinator, `&type=${HELD_BACK}`)
    expect(before.filter((item) => item.type === HELD_BACK)).toHaveLength(0)

    // The withdrawal: the photos leave the public read at once; their files answer 404.
    await guardianImageConsent(request, family.guardian.token, family.younger.personId, false)
    expect(await publicIds()).toEqual([graphic])
    for (const id of photos) {
      expect((await publicGet(request, `${scene.publicPath}/files/${id}`)).status).toBe(404)
      const staff = await pictureOf(request, coordinator, eventId, id)
      expect(staff.state).toBe('waiting_for_consent')
      expect(staff.missingConsent.map((mark) => mark.id)).toEqual([family.younger.personId])
    }

    // One notice for the event's manager: the event and the count, never the child.
    await expect
      .poll(
        async () =>
          (await readNotifications(request, coordinator, `&type=${HELD_BACK}`)).filter((item) => item.type === HELD_BACK)
            .length,
        { timeout: 90_000, message: 'the held-back notice' },
      )
      .toBe(1)
    const [notice] = (await readNotifications(request, coordinator, `&type=${HELD_BACK}`)).filter(
      (item) => item.type === HELD_BACK,
    )
    expect(notice?.sourceEntityId).toBe(eventId)
    expect(notice?.linkHref).toBe(`/backend/activities/club-events/${eventId}?tab=files`)
    expect(notice?.bodyVariables).toEqual({ event: 'PRZYKŁAD CUP 2026', count: '2' })
    const text = JSON.stringify(notice)
    for (const secret of [family.younger.firstName, family.younger.lastName, family.younger.personId]) {
      expect(text).not.toContain(secret)
    }

    // The consent again: the photos return without being published again.
    await guardianImageConsent(request, family.guardian.token, family.younger.personId, true)
    expect(await publicIds()).toEqual([...photos, graphic])
  } finally {
    await club.cleanup()
  }
})
