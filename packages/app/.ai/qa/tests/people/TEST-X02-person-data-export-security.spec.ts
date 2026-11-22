import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import {
  assignRole,
  birthDateTurning,
  call,
  createClub,
  createPerson,
  createSecondOrganization,
  createStaff,
  signInAs,
  type Club,
} from '../_fixtures/club'
import { create } from '../_fixtures/club-structure'
import { editRoleFeatures, exportLogRows, exportPerson, section } from '../_fixtures/data-export'

// Person data export spec (#527): TEST-X02 — the export fails closed. Another organization's person and another
// tenant's person answer 404 with no log row; the org A export holds none of the subject's rows stored under
// organization B; a member without the feature (403), a coordinator holding `people.persons.export` without a
// `club_admin` grant (403 `scope_denied`) and an anonymous caller (401) get nothing.
test.describe.configure({ timeout: 300_000 })

/** One dispatch and one delivery to `personId` stored in the given organization (raw rows; the scope is the test). */
async function seedDelivery(club: Club, organizationId: string, personId: string): Promise<string> {
  const dispatchId = randomUUID()
  const deliveryId = randomUUID()
  await withClient(async (client) => {
    await client.query(
      `insert into foundation_dispatches (id, tenant_id, organization_id, created_at, updated_at, template_id,
         source_module, source_type, source_id, idempotency_key, params, acting_role, status)
       values ($1, $2, $3, now(), now(), 'test.export', 'people', 'test', $1, $1, '{}', 'club_admin', 'done')`,
      [dispatchId, club.tenant.tenantId, organizationId],
    )
    await client.query(
      `insert into foundation_deliveries (id, tenant_id, organization_id, created_at, updated_at, dispatch_id,
         person_id, channel, locale, status, email_hash)
       values ($1, $2, $3, now(), now(), $4, $5, 'email', 'pl', 'sent', 'secret-hash')`,
      [deliveryId, club.tenant.tenantId, organizationId, dispatchId, personId],
    )
  })
  return deliveryId
}

test('TEST-X02 the export is organization- and tenant-scoped and refuses every caller but the club administrator', async ({
  request,
}) => {
  const club = await createClub(request, 'test-x02-export-scope')
  const otherClub = await createClub(request, 'test-x02-export-tenant')
  try {
    const admin = club.adminToken
    const subject = await createPerson(request, admin, {
      firstName: 'Ola',
      lastName: 'Eksportowa',
      birthDate: birthDateTurning(30),
      email: 'ola-eksportowa@example.org',
    })
    const second = await createSecondOrganization(request, club)
    const orgBPerson = await createPerson(request, second.adminToken, { firstName: 'Basia', lastName: 'Obca' })
    const tenantBPerson = await createPerson(request, otherClub.adminToken, { firstName: 'Celina', lastName: 'Obca' })
    const ownDelivery = await seedDelivery(club, club.tenant.organizationId, subject)
    const foreignDelivery = await seedDelivery(club, second.organizationId, subject)

    // Another organization's and another tenant's person: 404, and no log row for them.
    for (const foreign of [orgBPerson, tenantBPerson]) {
      const refused = await exportPerson(request, admin, foreign)
      expect(refused.status, JSON.stringify(refused.body)).toBe(404)
      expect(refused.body?.code).toBe('person_not_found')
      expect(await exportLogRows(foreign)).toEqual([])
    }

    // The org A export: the subject's own delivery, never the one stored under organization B.
    const exported = await exportPerson(request, admin, subject)
    expect(exported.status, JSON.stringify(exported.body)).toBe(200)
    const deliveries = section(exported.body!, 'foundation_deliveries').rows.map((row) => row.id)
    expect(deliveries).toContain(ownDelivery)
    expect(deliveries).not.toContain(foreignDelivery)
    expect(JSON.stringify(exported.body)).not.toContain('secret-hash')

    // A member without the feature: 403.
    const member = await createStaff(request, club, {
      firstName: 'Marta',
      lastName: 'Członkini',
      birthDate: birthDateTurning(35),
    })
    const memberToken = await signInAs(request, club, member.userId, member.email)
    expect((await exportPerson(request, memberToken, subject)).status).toBe(403)

    // A coordinator holding `people.persons.export` without a `club_admin` grant: 403 `scope_denied`.
    await editRoleFeatures(request, club, 'vereino_coordinator', (features) => [...features, 'people.persons.export'])
    const sectionId = await create(request, admin, 'sections', { name: 'Sekcja eksportu' })
    const coordinator = await createStaff(request, club, {
      firstName: 'Konrad',
      lastName: 'Koordynator',
      birthDate: birthDateTurning(41),
    })
    await assignRole(request, admin, {
      personId: coordinator.personId,
      role: 'coordinator',
      sectionId,
      validFrom: '2020-01-01',
    })
    const coordinatorToken = await signInAs(request, club, coordinator.userId, coordinator.email)
    await expect
      .poll(async () => (await exportPerson(request, coordinatorToken, subject)).body?.code, { timeout: 20_000 })
      .toBe('scope_denied')

    // Unauthenticated: 401.
    const anonymous = await request.get(`/api/people/persons/${subject}/data-export`)
    expect(anonymous.status()).toBe(401)

    // Only the administrator's export left a log row for the subject.
    expect(await exportLogRows(subject)).toEqual([
      {
        actor_user_id: club.adminUserId,
        acting_role: 'club_admin',
        resource_kind: 'people:person',
        purpose: 'data_subject_export',
      },
    ])
  } finally {
    await otherClub.cleanup()
    await club.cleanup()
  }
})
