import { expect, test } from '@playwright/test'
import { documentOf, exportPerson, section } from '../_fixtures/data-export'
import { guardianImageConsent, markAndConfirm, pictureCommand, pictureId, pictureScene } from '../_fixtures/pictures'

// Event photos spec phase 2 (#872; REQ-I11, AC-I07): TEST-I10 — the younger ward is marked on a public photo of
// "PRZYKŁAD CUP 2026" after the guardian gave and withdrew and gave again the image consent. The ward's data export
// (#527) lists the picture with its event, kind, description and publication under `activities_club_event_file_people`
// (RoPA A18), and the three consent decisions under `people_consent_events`.
test.describe.configure({ timeout: 300_000 })

test('TEST-I10 a person’s data export lists the pictures they are marked on and their consent history', async ({
  request,
}) => {
  const scene = await pictureScene(request, 'test-i10')
  const { club, family, eventId, coordinator } = scene
  try {
    const ward = family.younger.personId
    for (const granted of [true, false, true]) {
      await guardianImageConsent(request, family.guardian.token, ward, granted)
    }
    const photo = await pictureId(request, coordinator, eventId, { description: 'Finał Żaków' })
    await markAndConfirm(request, coordinator, eventId, photo, [ward])
    expect((await pictureCommand(request, coordinator, eventId, photo, 'publish')).status).toBe(200)

    const document = documentOf(await exportPerson(request, club.adminToken, ward))
    const marks = section(document, 'activities_club_event_file_people')
    expect(marks.activity).toBe('A18')
    expect(marks.rows).toEqual([
      expect.objectContaining({
        pictureId: photo,
        clubEventId: eventId,
        clubEvent: 'PRZYKŁAD CUP 2026',
        kind: 'photo',
        description: 'Finał Żaków',
        publishedAt: expect.any(String),
      }),
    ])
    const history = section(document, 'people_consent_events').rows.filter(
      (row) => (row as { kind?: string }).kind === 'image',
    )
    expect(history.map((row) => (row as { granted?: boolean }).granted)).toEqual([true, false, true])
  } finally {
    await club.cleanup()
  }
})
