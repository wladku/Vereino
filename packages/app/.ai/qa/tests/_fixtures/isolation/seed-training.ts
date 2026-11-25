// training records of the cross-club isolation guard (#628; training outlines spec phase 2, #683): a weekly training
// series of Żaki of its own (three sessions) with a series outline, so each session holds its own copy; an own outline
// of Żaki's coach with an image on its first exercise; and the session outline of the first session.
import { expect } from '@playwright/test'
import { addDays, safeDay, weekdayOf } from '../activities'
import { png } from '../publication'
import type { ModuleSeed } from './seed'

type Created = { id?: string; updatedAt?: string; copyIds?: string[] }

const exercise = (name: string, minutes: number) => ({
  name,
  minutes,
  organisation: 'Pole 20×20 m',
  coachingPoints: '',
})

export const outlineBody = (topic: string) => ({
  language: 'pl',
  topic,
  goal: 'Doskonalenie gry 1×1',
  ageCategory: 'U11',
  durationMinutes: 75,
  playersCount: 12,
  equipment: 'Pachołki, piłki',
  parts: {
    warm_up: [exercise('Rondo 4×1', 15)],
    main: [exercise('Gra 1×1 na małe bramki', 40)],
    cool_down: [exercise('Rozciąganie', 10)],
  },
})

export const seedTraining: ModuleSeed = async ({ request, seeded, api }) => {
  const { refs } = seeded
  // An outline has a person as its author: the coach of Żaki writes them.
  const coach = seeded.tokens.coach
  const day = safeDay(undefined, 3)
  const series = await api<Created>('POST', '/api/activities/activities', {
    data: {
      groupId: refs.group,
      name: 'Trening z konspektem',
      type: 'training',
      placeId: refs.place,
      coachPersonId: refs.coachPerson,
      recurrenceRule: `FREQ=WEEKLY;BYDAY=${weekdayOf(day)};UNTIL=${addDays(day, 14).replace(/-/g, '')}`,
      startsOn: day,
      startTime: '06:00',
      endTime: '07:00',
    },
    status: 201,
  })
  refs.trainingActivity = String(series.body?.id)
  const sessions = await api<{ items?: { id: string }[] }>(
    'GET',
    `/api/activities/occurrences?pageSize=10&sortField=occurrenceDate&sortDir=asc&activityId=${refs.trainingActivity}`,
  )
  const items = sessions.body?.items ?? []
  expect(items.length, 'the series has sessions').toBeGreaterThanOrEqual(2)
  refs.trainingOccurrence = items[0].id
  const seriesOutline = await api<Created>('POST', '/api/training/outlines', {
    token: coach,
    data: { ...outlineBody('Cykl: gra 1×1'), activityId: refs.trainingActivity },
    status: 201,
  })
  refs.seriesOutline = String(seriesOutline.body?.id)
  expect(seriesOutline.body?.copyIds?.length ?? 0, 'every planned session got a copy').toBeGreaterThanOrEqual(2)
  const own = await api<Created>('POST', '/api/training/outlines', {
    token: coach,
    data: { ...outlineBody('Moje rondo'), groupId: refs.group },
    status: 201,
  })
  refs.outline = String(own.body?.id)
  const image = await request.fetch(`/api/training/outlines/${refs.outline}/images`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${coach}`,
      'x-om-ext-optimistic-lock-expected-updated-at': String(own.body?.updatedAt),
    },
    multipart: { file: png([30, 140, 60]), part: 'main', index: '0' },
    timeout: 60_000,
  })
  const imageBody = (await image.json().catch(() => null)) as { attachmentId?: string } | null
  seeded.responses.push(imageBody)
  expect(image.status(), JSON.stringify(imageBody)).toBe(201)
  refs.outlineImage = String(imageBody?.attachmentId)
  const listed = await api<{ items?: { id: string }[] }>(
    'GET',
    `/api/training/outlines?occurrenceId=${refs.trainingOccurrence}`,
    { token: coach },
  )
  refs.sessionOutline = String(listed.body?.items?.[0]?.id)
  seeded.markers.push(refs.outline, refs.seriesOutline, refs.sessionOutline, refs.outlineImage)
}
