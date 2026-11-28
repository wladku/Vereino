import { expect, test } from '@playwright/test'
import { undoByToken } from '@open-mercato/core/helpers/integration/undoHarness'
import { birthDateTurning, createPerson } from '../_fixtures/club'
import { actionLogEntries } from '../_fixtures/people'
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

// Issue #899 (follow-up of #872; event photos spec BR-I01): undoing a picture's marks never makes it public again
// without a new confirmation when the undo drops a person marked now. A published photo marks the younger ward, whose
// guardian gave the image consent, and is public. The club administrator marks an adult with no image consent too
// (no confirmation): the photo leaves the public read. Undoing that mark change brings the earlier marks back but not
// the confirmation, so the photo stays hidden ("unconfirmed") until it is confirmed again. An undo that drops nobody
// marked now (the marks were all removed) still restores the earlier confirmation.
test.describe.configure({ timeout: 420_000 })

test('ISSUE-899 an undo of the marks that drops a person marked now needs a new confirmation before the photo is public', async ({
  request,
}) => {
  const scene = await pictureScene(request, 'issue-899')
  const { club, family, eventId } = scene
  // The club administrator manages every club event and may undo its own audit entries.
  const admin = club.adminToken
  const latestMarksUndo = async (id: string) => {
    const log = (await actionLogEntries(request, admin, id)).find(
      (entry) => entry.commandId === 'activities.club_event_files.set_people',
    )
    expect(log?.undoToken).toBeTruthy()
    return String(log?.undoToken)
  }
  const publicIds = async () => {
    const read = await publicGet(request, scene.publicPath)
    expect(read.status, JSON.stringify(read.body)).toBe(200)
    return (read.body?.event as { pictures: PublicPicture[] }).pictures.map((picture) => picture.id)
  }
  try {
    await guardianImageConsent(request, family.guardian.token, family.younger.personId, true)
    const stranger = await createPerson(request, admin, {
      firstName: 'Nowy',
      lastName: 'Rozpoznany',
      birthDate: birthDateTurning(30),
    })
    const photo = await pictureId(request, admin, eventId, { description: 'Finał Żaków' })
    await markAndConfirm(request, admin, eventId, photo, [family.younger.personId])
    const published = await pictureCommand(request, admin, eventId, photo, 'publish')
    expect(published.status, JSON.stringify(published.body)).toBe(200)
    expect(await publicIds()).toEqual([photo])

    // A newly recognised person without consent is marked: the photo leaves the public read.
    const added = await pictureCommand(request, admin, eventId, photo, 'people', {
      personIds: [family.younger.personId, stranger],
      confirmed: false,
    })
    expect(added.status, JSON.stringify(added.body)).toBe(200)
    expect(await publicIds()).toEqual([])

    // The undo restores the marks, not the confirmation: the photo stays hidden.
    const undone = await undoByToken(request, admin, await latestMarksUndo(photo))
    expect(undone.status(), await undone.text()).toBe(200)
    const afterUndo = await pictureOf(request, admin, eventId, photo)
    expect(afterUndo.marks.map((mark) => mark.id)).toEqual([family.younger.personId])
    expect(afterUndo.state).toBe('unconfirmed')
    expect(await publicIds()).toEqual([])

    // A person confirms again: public.
    await markAndConfirm(request, admin, eventId, photo, [family.younger.personId])
    expect(await publicIds()).toEqual([photo])

    // An undo that drops nobody marked now keeps the earlier confirmation.
    const cleared = await pictureCommand(request, admin, eventId, photo, 'people', { personIds: [], confirmed: false })
    expect(cleared.status, JSON.stringify(cleared.body)).toBe(200)
    expect(await publicIds()).toEqual([])
    const restored = await undoByToken(request, admin, await latestMarksUndo(photo))
    expect(restored.status(), await restored.text()).toBe(200)
    const afterRestore = await pictureOf(request, admin, eventId, photo)
    expect(afterRestore.marks.map((mark) => mark.id)).toEqual([family.younger.personId])
    expect(afterRestore.state).toBe('public')
    expect(await publicIds()).toEqual([photo])
  } finally {
    await club.cleanup()
  }
})
