import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { birthDateTurning, calendarDate, createClub, createPerson } from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import { addMembership, createGroup } from '../_fixtures/groups'
import { createGuardianship } from '../_fixtures/people'
import {
  bankDecide,
  bankImports,
  bankPayers,
  bankTransfers,
  createFee,
  deleteBankImport,
  generate,
  importStatement,
  periodFromNow,
  type BankImportItem,
  type BankTransferItem,
} from '../_fixtures/payments'
import { uiText } from '../_fixtures/ui-text'

// TEST-C05 (payments parity spec phase 4, REQ-C04, DD-C13, AC-C04; issue #294, B-29): a family with two open charges
// of PLN 150. Statement A holds a transfer with the payer code (recorded automatically), one with the ward's name and
// the amount (to confirm) and a donation (unmatched). A cannot be deleted: 409 `bank_import_has_bookings`, and still
// after its transfer is undone. Statement C records the code transfer automatically again, A's transfer is confirmed
// by hand: only C's reads "recorded automatically". Statement B (nothing booked) is deletable: a stale lock token
// answers 409 and keeps it; with its token 204 removes its transactions, the import and its file, and the same file
// imports again; an import stored before #294 (two file assignments) loses its rows but keeps the file. In the browser at 1280 px the decisions are buttons in the row (folded into the menu at 375 px), the
// history is a table with the eight columns, and an import is deleted through the confirmation.
test.describe.configure({ timeout: 300_000 })

function byTitle(items: readonly BankTransferItem[], fragment: string): BankTransferItem {
  const found = items.find((item) => item.title.includes(fragment))
  if (!found) throw new Error(`no transfer titled "${fragment}" in ${JSON.stringify(items.map((item) => item.title))}`)
  return found
}

function byFile(items: readonly BankImportItem[] | undefined, fileName: string): BankImportItem {
  const found = items?.find((item) => item.fileName === fileName)
  if (!found) throw new Error(`no import "${fileName}"`)
  return found
}

async function storedRows(importId: string) {
  return withClient(async (client) => {
    const imports = await client.query('select id from payments_bank_imports where id = $1', [importId])
    const transfers = await client.query('select id from payments_bank_transactions where import_id = $1', [importId])
    const files = await client.query('select id from attachments where record_id = $1', [importId])
    return { imports: imports.rowCount, transfers: transfers.rowCount, files: files.rowCount }
  })
}

test('TEST-C05 bank statement row buttons, automatic badge and deleting an import', async ({ page, request }) => {
  const club = await createClub(request, 'test-c05')
  try {
    const admin = club.adminToken
    const since = calendarDate(-120)
    const today = calendarDate()
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia' })
    const zaki = await createGroup(request, admin, { sectionId: academy, name: 'Żaki', kind: 'team' })
    await createFee(request, admin, {
      name: 'Żaki',
      groupId: zaki,
      period: 'monthly',
      amount: 15000,
      dueDay: 5,
      validFrom: since,
    })
    const payer = await createPerson(request, admin, {
      firstName: 'Anna',
      lastName: 'Lis',
      birthDate: birthDateTurning(40),
    })
    const ward = await createPerson(request, admin, {
      firstName: 'Ola',
      lastName: 'Lis',
      birthDate: birthDateTurning(10),
    })
    await createGuardianship(request, admin, {
      guardianPersonId: payer,
      wardPersonId: ward,
      relation: 'parent',
      isPrimaryPayer: true,
      validFrom: since,
    })
    await addMembership(request, admin, { groupId: zaki, personId: ward, role: 'participant', validFrom: since })
    for (const period of [periodFromNow(-2), periodFromNow(-1)]) {
      expect((await generate(request, admin, period)).status).toBe(200)
    }
    const payers = await bankPayers(request, admin)
    const code = String(payers.body?.items.find((item) => item.payerPersonId === payer)?.payerCode)

    // Statement A: the code transfer is recorded automatically, the name waits, the donation is unmatched.
    const statementA = [
      'Data;Kwota;Nadawca;Tytuł',
      `${today};150,00;Anna Lis;${code} składka`,
      `${today};150,00;Anna Lis;Składka Ola`,
      `${today};500,00;Firma XYZ;Darowizna na klub`,
    ].join('\n')
    const importedA = await importStatement(request, admin, statementA, {}, 'a.csv')
    expect(importedA.status, JSON.stringify(importedA.body)).toBe(201)
    expect(importedA.body).toMatchObject({ total: 3, booked: 1, suggested: 1, unmatched: 1 })
    const a = byFile((await bankImports(request, admin)).body?.items, 'a.csv')
    expect(a).toMatchObject({ deletable: false, importedBy: expect.any(Object) })

    // A recorded transfer blocks the delete; so does one recorded and undone since (DD-C13).
    const blocked = await deleteBankImport(request, admin, a.id, a.updatedAt)
    expect(blocked.status, JSON.stringify(blocked.body)).toBe(409)
    expect(blocked.body?.code).toBe('bank_import_has_bookings')
    const recorded = byTitle((await bankTransfers(request, admin)).body?.items ?? [], `${code} składka`)
    expect(recorded).toMatchObject({ status: 'booked', autoBooked: true })
    const undone = await bankDecide(request, admin, recorded.id, 'undo', recorded.updatedAt)
    expect(undone.status, JSON.stringify(undone.body)).toBe(200)
    const afterUndo = byFile((await bankImports(request, admin)).body?.items, 'a.csv')
    expect(afterUndo.deletable).toBe(false)
    const stillBlocked = await deleteBankImport(request, admin, afterUndo.id, afterUndo.updatedAt)
    expect(stillBlocked.status, JSON.stringify(stillBlocked.body)).toBe(409)
    expect(stillBlocked.body?.code).toBe('bank_import_has_bookings')
    expect((await storedRows(a.id)).transfers).toBe(3)

    // Statement C records the code transfer automatically; A's is confirmed by hand.
    const importedC = await importStatement(
      request,
      admin,
      `Data;Kwota;Nadawca;Tytuł\n${today};150,00;Anna Lis;${code} wrzesień\n`,
      {},
      'c.csv',
    )
    expect(importedC.body).toMatchObject({ booked: 1 })
    const confirmed = await bankDecide(request, admin, recorded.id, 'confirm', undone.body?.updatedAt)
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200)
    const booked = (await bankTransfers(request, admin, '&status=booked')).body?.items ?? []
    expect(booked.map((item) => [item.title, item.autoBooked]).sort()).toEqual([
      [`${code} składka`, false],
      [`${code} wrzesień`, true],
    ])

    // Statement B: nothing booked. A stale lock token answers 409 and removes nothing.
    const statementB = `Data;Kwota;Nadawca;Tytuł\n${today};75,00;Ktoś;Wpłata bez kodu\n`
    expect((await importStatement(request, admin, statementB, {}, 'b.csv')).status).toBe(201)
    const b = byFile((await bankImports(request, admin)).body?.items, 'b.csv')
    expect(b.deletable).toBe(true)
    const stale = await deleteBankImport(request, admin, b.id, '2000-01-01T00:00:00.000Z')
    expect(stale.status, JSON.stringify(stale.body)).toBe(409)
    expect(await storedRows(b.id)).toEqual({ imports: 1, transfers: 1, files: 1 })

    // A skip does not block the delete; with its token the transactions, the import and the file go.
    const transferB = byTitle((await bankTransfers(request, admin)).body?.items ?? [], 'Wpłata bez kodu')
    expect(
      (await bankDecide(request, admin, transferB.id, 'ignore', transferB.updatedAt, { reason: 'other' })).status,
    ).toBe(200)
    const deleted = await deleteBankImport(request, admin, b.id, b.updatedAt)
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(204)
    expect(await storedRows(b.id)).toEqual({ imports: 0, transfers: 0, files: 0 })
    expect((await deleteBankImport(request, admin, b.id, b.updatedAt)).status).toBe(404)

    // The same file imports again: its transfer is fresh, not a duplicate.
    const again = await importStatement(request, admin, statementB, {}, 'b.csv')
    expect(again.status, JSON.stringify(again.body)).toBe(201)
    expect(again.body).toMatchObject({ total: 1, unmatched: 1, duplicates: 0 })

    // An import stored before #294 carries a second assignment the platform refuses to release: its rows still go (so
    // the file imports again) and the file stays.
    const legacyStatement = `Data;Kwota;Nadawca;Tytuł
${today};40,00;Ktoś inny;Stary import
`
    expect((await importStatement(request, admin, legacyStatement, {}, 'legacy.csv')).status).toBe(201)
    const legacy = byFile((await bankImports(request, admin)).body?.items, 'legacy.csv')
    await withClient((client) =>
      client.query(
        `update attachments set storage_metadata = jsonb_set(storage_metadata, '{assignments}',
           (storage_metadata->'assignments') || jsonb_build_array(jsonb_build_object('type', 'payments:bank_statement', 'id', $1::text)))
         where record_id = $1`,
        [legacy.id],
      ),
    )
    const legacyDeleted = await deleteBankImport(request, admin, legacy.id, legacy.updatedAt)
    expect(legacyDeleted.status, JSON.stringify(legacyDeleted.body)).toBe(204)
    expect(await storedRows(legacy.id)).toEqual({ imports: 0, transfers: 0, files: 1 })
    expect((await importStatement(request, admin, legacyStatement, {}, 'legacy.csv')).body).toMatchObject({
      unmatched: 1,
    })

    // B-29 in the browser at 1280 px: the decisions are buttons in the row, not in a menu.
    page.setDefaultTimeout(30_000)
    const password = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    club.adminToken = await getAuthToken(request, club.tenant.email, password)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/backend/payments/bank')
    const suggestedRow = page.getByRole('row').filter({ hasText: 'Składka Ola' })
    await expect(
      suggestedRow.getByRole('button', { name: uiText('payments.bank.actions.confirm', { exact: true }) }),
    ).toBeVisible()
    await expect(
      suggestedRow.getByRole('button', { name: uiText('payments.bank.actions.change', { exact: true }) }),
    ).toBeVisible()
    await expect(
      suggestedRow.getByRole('button', { name: uiText('payments.bank.actions.ignore', { exact: true }) }),
    ).toBeVisible()
    await expect(suggestedRow.getByRole('button', { name: uiText('ui.rowActions.openActions') })).toBeHidden()

    // Recorded: only the automatic one says so.
    await page.getByRole('tab', { name: uiText('payments.bank.perspectives.booked') }).click()
    await expect(page.getByRole('row').filter({ hasText: 'wrzesień' })).toContainText(
      uiText('payments.bank.status.autoBooked'),
    )
    const manualRow = page.getByRole('row').filter({ hasText: `${code} składka` })
    await expect(manualRow).toContainText(uiText('payments.bank.status.booked'))
    await expect(manualRow).not.toContainText(uiText('payments.bank.status.autoBooked'))
    await expect(
      manualRow.getByRole('button', { name: uiText('payments.bank.actions.undo', { exact: true }) }),
    ).toBeVisible()

    // The history is a table with the eight columns; the deletable import has Delete, the booked one has not.
    const history = page.getByTestId('bank-history')
    for (const column of ['file', 'when', 'who', 'items', 'automatic', 'toConfirm', 'unmatched', 'skipped']) {
      await expect(
        history.getByRole('columnheader', { name: uiText(`payments.bank.history.columns.${column}`, { exact: true }) }),
      ).toBeVisible()
    }
    await expect(history.locator('tbody tr')).toHaveCount(4)
    await expect(
      history
        .getByRole('row')
        .filter({ hasText: 'a.csv' })
        .getByRole('button', { name: uiText('ui.rowActions.openActions') }),
    ).toHaveCount(0)
    await history
      .getByRole('row')
      .filter({ hasText: 'b.csv' })
      .getByRole('button', { name: uiText('ui.rowActions.openActions') })
      .click()
    await page.getByRole('menuitem', { name: uiText('payments.bank.history.delete.action', { exact: true }) }).click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText(uiText('payments.bank.history.delete.title', { params: { file: 'b.csv' } }))
    await dialog.getByRole('button', { name: uiText('payments.bank.history.delete.action', { exact: true }) }).click()
    await expect(history.locator('tbody tr')).toHaveCount(3)
    expect(
      ((await bankImports(request, club.adminToken)).body?.items ?? []).some((item) => item.fileName === 'b.csv'),
    ).toBe(false)

    // Under 640 px the decisions fold into the row menu.
    await page.setViewportSize({ width: 375, height: 800 })
    await page.getByRole('tab', { name: uiText('payments.bank.perspectives.suggested') }).click()
    const narrowRow = page.getByRole('row').filter({ hasText: 'Składka Ola' })
    await expect(
      narrowRow.getByRole('button', { name: uiText('payments.bank.actions.confirm', { exact: true }) }),
    ).toBeHidden()
    await expect(narrowRow.getByRole('button', { name: uiText('ui.rowActions.openActions') })).toBeVisible()
  } finally {
    await club.cleanup()
  }
})
