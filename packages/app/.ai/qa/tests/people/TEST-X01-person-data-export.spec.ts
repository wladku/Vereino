import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { getOccurrence } from '../_fixtures/activities'
import { bothSeries, declare, familyFor, firstSession } from '../_fixtures/attendance'
import { OPTIMISTIC_LOCK_HEADER, calendarDate, call, createClub } from '../_fixtures/club'
import { markRead, postReply, postThread } from '../_fixtures/communication'
import { allKeys, exportLogRows, exportPerson, section, type ExportDocument } from '../_fixtures/data-export'
import { getMe, putMe } from '../_fixtures/members'
import { seedOrder } from '../_fixtures/orders'

// Person data export spec (#527, AC-X01, AC-X02, AC-X04, AC-X05): TEST-X01 — the TEST-008 family (a guardian, two
// wards, the coach of their group) with one row per contributor table the fixtures allow: memberships, an attendance
// declared by the guardian, a message by the elder ward and one by the administrator, a charge and an order of the
// younger ward paid by the guardian, a contract of the coach; the coach reads the guardian's contacts (a contact access
// log row) and reports an absence with a reason (a substitution entry). The administrator exports the younger ward,
// the guardian, the elder ward and the coach: every expected table is a section; another person appears only as a
// relation (with a name for a guardian, ward, payer or coach), never by id; the other author's message body is absent
// and counted; the substitution reason is decrypted and listed for review; no `*Hash` key leaves; every export writes
// one `people_data_export_log` row before the read.
test.describe.configure({ timeout: 420_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const SECURITY_CATEGORIES = ['action_logs', 'access_log', 'application_logs', 'backups']

function expectNoHashKeys(document: ExportDocument): void {
  expect([...allKeys(document)].filter((key) => /hash$/i.test(key))).toEqual([])
}

function expectNoIds(document: ExportDocument, ids: readonly string[]): void {
  const serialized = JSON.stringify(document)
  for (const id of ids) expect(serialized, `another person's id ${id}`).not.toContain(id)
}

test('TEST-X01 the administrator exports one person: every module part, other people redacted, the export logged', async ({
  request,
}) => {
  const club = await createClub(request, 'test-x01-export')
  try {
    const admin = club.adminToken
    const family = await familyFor(request, club)
    const { training } = await bothSeries(request, club, family)
    const session = firstSession(training.sessions)
    const guardian = family.guardian
    const younger = family.younger.personId
    const elder = family.elder

    // The guardian consents to share contacts; the coach reads them (an `activities_contact_access_log` row).
    const me = await getMe(request, guardian.token)
    const consented = await putMe(request, guardian.token, { shareContactWithCoaches: true }, me.body?.person.updatedAt)
    expect(consented.status, JSON.stringify(consented.body)).toBe(200)
    const contacts = await call(request, 'GET', `/api/activities/occurrences/${session.id}/guardian-contacts`, family.coach.token)
    expect(contacts.status, JSON.stringify(contacts.body)).toBe(200)

    // The guardian declares the younger ward for the session (an attendance row of the ward).
    const declared = await declare(request, guardian.token, { occurrenceId: session.id, personId: younger, declared: 'yes' })
    expect(declared.status, JSON.stringify(declared.body)).toBe(200)

    // The coach reports an absence with a reason that names a child (a substitution entry, reviewed before sending).
    const reason = `Choroba ${randomUUID().slice(0, 8)}`
    const current = await getOccurrence(request, admin, session.id)
    const absence = await call(request, 'POST', `/api/activities/occurrences/${session.id}/absence`, family.coach.token, {
      data: { reason },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String((current.body as { updatedAt?: string } | null)?.updatedAt) },
    })
    expect(absence.status, JSON.stringify(absence.body)).toBe(200)

    // A thread to the elder ward by the administrator, the ward's reply and read marker.
    const adminBody = `Wiadomość administratora ${randomUUID()}`
    const thread = await postThread(request, admin, {
      audience: { kind: 'persons', ids: [elder.personId] },
      subject: 'Sprzęt',
      body: adminBody,
    })
    expect(thread.status, JSON.stringify(thread.body)).toBe(201)
    const threadId = String(thread.body?.threadId)
    const replyBody = `Odpowiedź Kuby ${randomUUID()}`
    const reply = await postReply(request, elder.token, threadId, replyBody)
    expect([200, 201], JSON.stringify(reply.body)).toContain(reply.status)
    expect((await markRead(request, elder.token, threadId)).status).toBe(200)

    // A charge of the younger ward (the guardian, primary payer, pays) and an order the guardian placed for the ward.
    const charge = await call<{ chargeId?: string }>(request, 'POST', '/api/payments/charges', admin, {
      data: { personId: younger, description: 'Składka', amount: 12000, dueDate: calendarDate(7) },
    })
    expect(charge.status, JSON.stringify(charge.body)).toBe(201)
    const order = await seedOrder(club.tenant, {
      campaignId: randomUUID(),
      participantPersonId: younger,
      orderedByPersonId: guardian.personId,
      paymentDueOn: calendarDate(14),
      printName: 'HANIA',
      printNumber: 7,
      lines: [{ productId: randomUUID(), size: '128', unitPrice: 9000 }],
    })

    // A contract of the coach.
    const contract = await call<{ id?: string }>(request, 'POST', '/api/club_core/contracts', admin, {
      data: { partyType: 'person', partyId: family.coach.personId, kind: 'other', validFrom: calendarDate() },
    })
    expect(contract.status, JSON.stringify(contract.body)).toBe(201)

    // --- The younger ward ---
    const wardExport = await exportPerson(request, admin, younger)
    expect(wardExport.status, JSON.stringify(wardExport.body)).toBe(200)
    expect(wardExport.response.headers()['content-disposition']).toMatch(
      /^attachment; filename="person-data-\d{4}-\d{2}-\d{2}\.json"$/,
    )
    expect(wardExport.response.headers()['cache-control']).toContain('no-store')
    const ward = wardExport.body!
    expect(ward).toMatchObject({ format: 'vereino.person-data-export', version: 1 })
    expect(ward.subject).toMatchObject({ id: younger, firstName: family.younger.firstName })
    expect(section(ward, 'people_guardianships').rows).toContainEqual(
      expect.objectContaining({
        relation: 'ward',
        other: { relation: 'guardian', name: 'Anna Kowalska' },
        isPrimaryPayer: true,
      }),
    )
    expect(section(ward, 'groups_memberships').rows.length).toBeGreaterThan(0)
    const attendance = section(ward, 'activities_attendances').rows
    expect(attendance).toContainEqual(
      expect.objectContaining({ occurrenceId: session.id, declaredBy: { relation: 'guardian' } }),
    )
    expect(section(ward, 'payments_charges').rows).toContainEqual(
      expect.objectContaining({ id: charge.body?.chargeId, debtor: 'subject' }),
    )
    expect(section(ward, 'payments_orders').rows).toContainEqual(
      expect.objectContaining({
        id: order.orderId,
        participant: 'subject',
        orderedBy: { relation: 'orderer', name: 'Anna Kowalska' },
      }),
    )
    expect(section(ward, 'payments_order_lines').rows).toHaveLength(1)
    for (const table of ['foundation_deliveries', 'people_role_assignments', 'communication_thread_messages']) {
      section(ward, table)
    }
    const omittedCategories = ward.omitted.flatMap((entry) => (entry.category ? [entry.category] : []))
    for (const category of SECURITY_CATEGORIES) expect(omittedCategories).toContain(category)
    expect(ward.omitted.filter((entry) => entry.reason === 'no_contributor' || entry.reason === 'module_not_enabled'))
      .toEqual([])
    expectNoHashKeys(ward)
    expectNoIds(ward, [guardian.personId, family.coach.personId, elder.personId, family.other.child.personId])
    expect(await exportLogRows(younger)).toEqual([
      expect.objectContaining({ actor_user_id: club.adminUserId, acting_role: 'club_admin', purpose: 'data_subject_export' }),
    ])

    // --- The guardian: both wards, the coach's read of the contacts as a role only, the charge as payer ---
    const guardianExport = await exportPerson(request, admin, guardian.personId)
    expect(guardianExport.status, JSON.stringify(guardianExport.body)).toBe(200)
    const parent = guardianExport.body!
    const wards = section(parent, 'people_guardianships').rows.map((row) => row.other)
    expect(wards).toContainEqual({ relation: 'ward', name: `${family.younger.firstName} ${family.younger.lastName}` })
    expect(section(parent, 'activities_contact_access_log').rows).toContainEqual(
      expect.objectContaining({ occurrenceId: session.id, reader: { relation: 'staff', actingRole: 'coach' } }),
    )
    expect(section(parent, 'payments_charges').rows).toContainEqual(
      expect.objectContaining({ id: charge.body?.chargeId, payer: 'subject' }),
    )
    expectNoHashKeys(parent)
    expectNoIds(parent, [younger, elder.personId, family.coach.personId, family.other.guardian.personId])

    // --- The elder ward: own message only, the administrator's counted ---
    const elderExport = await exportPerson(request, admin, elder.personId)
    expect(elderExport.status, JSON.stringify(elderExport.body)).toBe(200)
    const kuba = elderExport.body!
    const messages = section(kuba, 'communication_thread_messages')
    expect(messages.rows.map((row) => row.body)).toEqual([replyBody])
    expect(messages.omittedOtherAuthors).toBe(1)
    expect(JSON.stringify(kuba)).not.toContain(adminBody)
    expect(section(kuba, 'communication_thread_reads').rows).toContainEqual(expect.objectContaining({ threadId }))
    expect(section(kuba, 'communication_thread_participants').rows).toHaveLength(1)
    expectNoHashKeys(kuba)

    // --- The coach: the substitution with its decrypted reason for review, the contract, sessions coached ---
    const coachExport = await exportPerson(request, admin, family.coach.personId)
    expect(coachExport.status, JSON.stringify(coachExport.body)).toBe(200)
    const coach = coachExport.body!
    const substitution = section(coach, 'activities_substitution_entries')
    expect(substitution.reviewFields).toContain('reason')
    const entry = substitution.rows.find((row) => row.reason === reason)
    expect(entry).toMatchObject({ role: 'previous_coach', previousCoach: 'subject' })
    expect(coach.reviewRequired).toContainEqual({
      module: 'activities',
      table: 'activities_substitution_entries',
      recordId: String(entry?.id),
      field: 'reason',
    })
    expect(section(coach, 'club_core_contracts').rows).toContainEqual(expect.objectContaining({ id: contract.body?.id }))
    expect(coach.actorCounts).toContainEqual(expect.objectContaining({ table: 'activities_occurrences' }))
    expectNoHashKeys(coach)
    expectNoIds(coach, [guardian.personId, younger, elder.personId])
  } finally {
    await club.cleanup()
  }
})
