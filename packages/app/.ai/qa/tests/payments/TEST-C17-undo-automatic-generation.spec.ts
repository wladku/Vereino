import { expect, test, type APIRequestContext } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { zoneInstant } from '../_fixtures/activities'
import {
  OPTIMISTIC_LOCK_HEADER,
  birthDateTurning,
  call,
  calendarDate,
  createClub,
  createPerson,
  mercato,
  type Club,
} from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import { addMembership, createGroup } from '../_fixtures/groups'
import {
  createFee,
  generate,
  getCharge,
  listCharges,
  periodFromNow,
  recordPayment,
  type CodedBody,
} from '../_fixtures/payments'
import { actionLogEntries } from '../_fixtures/people'
import { uiText } from '../_fixtures/ui-text'

// TEST-C17 (payments parity spec, risk row "Automatic generation creates charges the club did not expect"; owner
// decision (a) on #403): an administrator undoes an automatic generation from the generation list.
// - API: the daily job generates next month (two charges); one is partly paid. The list shows the run with one open
//   charge. The undo needs the run's lock token (400 without it, 409 when stale), cancels only the open charge (reason
//   `generation_undone`) and leaves the partly paid one; a second undo answers 409 `generation_already_undone`; the
//   job never generates the month again; the undo is audited; another club's administrator gets 404.
// - UI: "Generations" on B-21 opens the list; a manual run is undone through the row action and its confirmation.
test.describe.configure({ timeout: 300_000 })

type GenerationItem = {
  id: string
  period: string
  created: number
  open: number
  cancelled: number | null
  undoneAt: string | null
  updatedAt: string
}

type JobRun = CodedBody & {
  outcome: { due: boolean; period: string; reason?: string }
  summary: { id: string; period: string; created: number } | null
}

function generateDue(club: Club, day: string): JobRun {
  const result = mercato([
    'payments',
    'run-job',
    '--job',
    'generate-charges',
    '--tenant',
    club.tenant.tenantId,
    '--org',
    club.tenant.organizationId,
    '--now',
    zoneInstant(day, '06:00'),
  ]) as JobRun | null
  if (!result) throw new Error('[internal] payments run-job generate-charges printed no result')
  return result
}

async function generations(request: APIRequestContext, token: string): Promise<GenerationItem[]> {
  const result = await call<{ items?: GenerationItem[] }>(request, 'GET', '/api/payments/charge-generations', token)
  expect(result.status, JSON.stringify(result.body)).toBe(200)
  return result.body?.items ?? []
}

function undo(request: APIRequestContext, token: string, id: string, lock: string | null) {
  return call<CodedBody & { cancelled?: number; period?: string }>(
    request,
    'POST',
    `/api/payments/charge-generations/${id}/undo`,
    token,
    { data: {}, headers: lock ? { [OPTIMISTIC_LOCK_HEADER]: lock } : {} },
  )
}

async function chargeStates(generationId: string) {
  return withClient(async (client) => {
    const { rows } = await client.query<{ id: string; status: string; cancel_reason: string | null }>(
      'select id, status, cancel_reason from payments_charges where generation_id = $1 order by status',
      [generationId],
    )
    return rows
  })
}

test('TEST-C17 an administrator undoes an automatic generation from the generation list', async ({ page, request }) => {
  const club = await createClub(request, 'test-c17')
  const other = await createClub(request, 'test-c17-other')
  try {
    const admin = club.adminToken
    const today = calendarDate()
    const section = await createStructure(request, admin, 'sections', { name: 'Sekcja pływacka' })
    const group = await createGroup(request, admin, { sectionId: section, name: 'Rekiny', kind: 'team' })
    for (const firstName of ['Marek', 'Piotr']) {
      const personId = await createPerson(request, admin, {
        firstName,
        lastName: 'Pływak',
        birthDate: birthDateTurning(30),
      })
      await addMembership(request, admin, { groupId: group, personId, role: 'participant', validFrom: today })
    }
    await createFee(request, admin, {
      name: 'Rekiny',
      groupId: group,
      period: 'monthly',
      amount: 12000,
      dueDay: 10,
      validFrom: today,
    })

    // The daily job generates next month on its first day.
    const nextMonth = periodFromNow(1)
    const run = generateDue(club, `${nextMonth}-01`)
    expect(run.outcome).toEqual({ due: true, period: nextMonth })
    expect(run.summary).toMatchObject({ period: nextMonth, created: 2 })
    const generationId = String(run.summary?.id)
    const charges = await listCharges(request, admin, `&generationId=${generationId}`)
    expect(charges).toHaveLength(2)
    const paidId = charges[0].id
    const paid = await getCharge(request, admin, paidId)
    const payment = await recordPayment(request, admin, paidId, paid.updatedAt, {
      amount: 5000,
      method: 'cash',
      paidOn: today,
    })
    expect(payment.status, JSON.stringify(payment.body)).toBe(201)

    // The list shows the automatic run with the one charge an undo would cancel.
    const listed = (await generations(request, admin)).find((item) => item.id === generationId)
    expect(listed).toMatchObject({ period: nextMonth, created: 2, open: 1, cancelled: null, undoneAt: null })
    const lock = String(listed?.updatedAt)

    // Another club's administrator cannot reach it.
    expect((await undo(request, other.adminToken, generationId, lock)).status).toBe(404)
    expect((await generations(request, other.adminToken)).some((item) => item.id === generationId)).toBe(false)

    // The lock token is required and compared.
    const noLock = await undo(request, admin, generationId, null)
    expect(noLock.status, JSON.stringify(noLock.body)).toBe(400)
    expect(noLock.body?.code).toBe('lock_token_required')
    const stale = await undo(request, admin, generationId, '2000-01-01T00:00:00.000Z')
    expect(stale.status, JSON.stringify(stale.body)).toBe(409)

    const undone = await undo(request, admin, generationId, lock)
    expect(undone.status, JSON.stringify(undone.body)).toBe(200)
    expect(undone.body).toMatchObject({ ok: true, id: generationId, period: nextMonth, cancelled: 1 })
    const states = await chargeStates(generationId)
    expect(states.find((row) => row.id === paidId)).toMatchObject({ status: 'partially_paid', cancel_reason: null })
    expect(states.filter((row) => row.id !== paidId)).toEqual([
      expect.objectContaining({ status: 'cancelled', cancel_reason: 'generation_undone' }),
    ])
    const after = (await generations(request, admin)).find((item) => item.id === generationId)
    expect(after).toMatchObject({ open: 0, cancelled: 1, undoneAt: expect.any(String) })

    const again = await undo(request, admin, generationId, String(after?.updatedAt))
    expect(again.status, JSON.stringify(again.body)).toBe(409)
    expect(again.body?.code).toBe('generation_already_undone')

    // An undone month is not generated again automatically, and the undo is audited.
    expect(generateDue(club, `${nextMonth}-15`).outcome).toMatchObject({ due: false, reason: 'generated' })
    const log = (await actionLogEntries(request, admin, generationId)).find(
      (entry) => entry.commandId === 'payments.charge_generations.undo',
    )
    expect(log).toBeDefined()

    // The page: "Generations" on B-21 opens the list; a manual run is undone through the row action.
    const laterMonth = periodFromNow(2)
    const manual = await generate(request, admin, laterMonth)
    expect(manual.status, JSON.stringify(manual.body)).toBe(200)
    page.setDefaultTimeout(30_000)
    const password = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    club.adminToken = await getAuthToken(request, club.tenant.email, password)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/backend/payments/charges')
    await page.getByTestId('charges-generations').click()
    await expect(page).toHaveURL(/\/backend\/payments\/generations$/)
    const list = page.getByTestId('charge-generations')
    await expect(list.locator('tbody tr')).toHaveCount(2)
    const undoneRow = list.getByRole('row').filter({ hasText: nextMonth })
    await expect(undoneRow).toContainText(uiText('payments.generations.status.undone', { params: { cancelled: 1 } }))
    await expect(undoneRow.getByRole('button', { name: uiText('ui.rowActions.openActions') })).toHaveCount(0)
    const manualRow = list.getByRole('row').filter({ hasText: laterMonth })
    await expect(manualRow).toContainText(uiText('payments.generations.status.active'))
    await manualRow.getByRole('button', { name: uiText('ui.rowActions.openActions') }).click()
    await page.getByRole('menuitem', { name: uiText('payments.generations.undo.action', { exact: true }) }).click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText(uiText('payments.generations.undo.title', { params: { period: laterMonth } }))
    await dialog.getByRole('button', { name: uiText('payments.generations.undo.action', { exact: true }) }).click()
    await expect(manualRow).toContainText(uiText('payments.generations.status.undone', { params: { cancelled: 2 } }))
    expect((await chargeStates(String(manual.body?.generationId))).map((row) => row.status)).toEqual([
      'cancelled',
      'cancelled',
    ])
  } finally {
    await other.cleanup()
    await club.cleanup()
  }
})
