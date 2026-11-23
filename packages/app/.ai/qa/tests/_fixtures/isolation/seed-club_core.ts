// club_core records of the cross-club isolation guard (#628): a published club page (every block on) under a public
// slug unique to the club, with the club logo; a public section of its own (unique slug, own logo, one public
// material); a place with a public calendar (unique slug) and one photo; an external place added from the event form
// with a public club event (unique slug, one open part, a poster); and a contract with the institution of the base seed
// and a signed PDF. Each public record of the base (`refs.section`, `refs.place`) stays untouched for later seeds.
import { expect } from '@playwright/test'
import { addDays, zoneInstant } from '../activities'
import { uniqueSuffix } from '../club'
import { getSection, pdf, png, publish, putSectionPublic, upload } from '../publication'
import type { ModuleSeed } from './seed'

export const seedClubCore: ModuleSeed = async ({ request, seeded, api, admin }) => {
  const { refs } = seeded
  const tag = `${seeded.label.toLowerCase()}${uniqueSuffix()}`
  const responses = seeded.responses
  const uploaded = async (
    path: string,
    file: Parameters<typeof upload>[3],
    fields: Record<string, string>,
    lock?: string | null,
  ) => {
    const result = await upload(request, admin, path, file, fields, lock)
    responses.push(result.body)
    expect(result.status, `club ${seeded.label}: POST ${path} ${JSON.stringify(result.body)}`).toBeLessThan(300)
    return result.body ?? {}
  }

  // The published club page and its logo.
  refs.clubSlug = `it628-club-${tag}`
  const settings = await publish(
    request,
    admin,
    refs.clubSlug,
    ['description_schedule', 'conditions', 'materials', 'contact', 'places_calendar', 'online_requests', 'events'],
    { publicDescription: 'Klub piłkarski', contactPhone: '600 000 000' },
  )
  responses.push(settings)
  const logo = await uploaded('/api/club_core/logo', png([20, 120, 60]), {}, settings.updatedAt)
  refs.clubLogo = String(logo.logoAttachmentId)

  // A public section with its own logo and a public material.
  refs.publicSection =
    (await api<{ id: string }>('POST', '/api/club_core/sections', { data: { name: 'Sekcja publiczna' } })).body?.id ??
    ''
  refs.sectionSlug = `it628-sekcja-${tag}`
  const madePublic = await putSectionPublic(request, admin, refs.publicSection, {
    isPublic: true,
    publicSlug: refs.sectionSlug,
    publicDescription: 'Opis sekcji',
    publicConditions: 'Warunki',
    publicContactName: 'Kontakt sekcji',
    shortDescription: 'Sekcja',
  })
  responses.push(madePublic.body)
  expect(madePublic.status, JSON.stringify(madePublic.body)).toBe(200)
  const sectionLogo = await uploaded(
    `/api/club_core/sections/${refs.publicSection}/logo`,
    png([200, 40, 40]),
    {},
    madePublic.body?.updatedAt,
  )
  refs.sectionLogo = String(sectionLogo.logoAttachmentId)
  const material = await uploaded(`/api/club_core/sections/${refs.publicSection}/materials`, pdf('regulamin.pdf'), {
    title: 'Regulamin sekcji',
    isPublic: 'true',
  })
  refs.material = String(material.id)
  responses.push(await getSection(request, admin, refs.publicSection))

  // A place with a public calendar and a photo.
  refs.placeSlug = `it628-hala-${tag}`
  refs.publicPlace =
    (
      await api<{ id: string }>('POST', '/api/club_core/places', {
        data: { name: 'Hala klubowa', kind: 'hall', publicSlug: refs.placeSlug, isPublicSchedule: true },
      })
    ).body?.id ?? ''
  const photo = await uploaded(`/api/club_core/places/${refs.publicPlace}/files`, png([40, 40, 200]), { kind: 'photo' })
  refs.placeFile = String(photo.id)

  // An external place added from the event form, with a public club event at it: one open part and a poster.
  refs.externalPlace =
    (
      await api<{ id: string }>('POST', '/api/club_core/places/external', {
        data: { name: 'Hala gminna', address: 'ul. Szkolna 50, Liszki', kind: 'hall' },
        status: 201,
      })
    ).body?.id ?? ''
  const external = await api<{ items?: { id: string; updatedAt: string }[] }>(
    'GET',
    `/api/club_core/places?ids=${refs.externalPlace}`,
  )
  refs.externalPlaceUpdatedAt = String(external.body?.items?.[0]?.updatedAt)
  refs.clubEventSlug = `it628-turniej-${tag}`
  refs.clubEvent =
    (
      await api<{ id: string }>('POST', '/api/activities/club-events', {
        data: {
          name: 'Turniej klubowy',
          publicSlug: refs.clubEventSlug,
          sectionId: refs.publicSection,
          placeId: refs.externalPlace,
          isPublic: true,
        },
        status: 201,
      })
    ).body?.id ?? ''
  const day = addDays(refs.today, 9)
  await api('POST', `/api/activities/club-events/${refs.clubEvent}/parts`, {
    data: {
      title: 'Turniej otwarty',
      categoryLabel: 'Seniorzy',
      groupId: null,
      startsAt: zoneInstant(day, '10:00'),
      endsAt: zoneInstant(day, '12:00'),
    },
    status: 201,
  })
  const poster = await uploaded(`/api/activities/club-events/${refs.clubEvent}/files`, png([10, 10, 10], 16), {
    kind: 'poster',
  })
  refs.clubEventFile = String(poster.id)

  // A contract with the institution of the base seed, with its signed PDF.
  refs.contract =
    (
      await api<{ id: string }>('POST', '/api/club_core/contracts', {
        data: { partyType: 'institution', partyId: refs.institution, kind: 'grant', validFrom: refs.today },
        status: 201,
      })
    ).body?.id ?? ''
  await uploaded(`/api/club_core/contracts/${refs.contract}/attachment`, pdf('umowa.pdf'), {})

  seeded.markers.push(refs.clubSlug, refs.sectionSlug, refs.placeSlug, refs.clubEventSlug)
}
