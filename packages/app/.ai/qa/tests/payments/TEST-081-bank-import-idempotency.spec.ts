import { expect, test } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { calendarDate, createClub } from '../_fixtures/club'
import { bankImports, bankTransfers, importStatement } from '../_fixtures/payments'

// TEST-081 (club management spec amendment B, research TEST-C07; REQ-030; issue #532): the club's bank account.
// - The same MT940 statement imported twice: the second import stores no transaction (every credit is a duplicate,
//   the debit is skipped), the transfer list keeps its count and the second import holds no rows.
// - A CSV export whose bank references were regenerated: the bank's transaction id column differs on every row, the
//   rest of each row is identical to an earlier CSV import, and the later file also carries one new transfer. The
//   fingerprint (`transferHash`: date, amount, sender, title, account — not the bank's reference, #229) finds every
//   earlier row again: only the new transfer is stored.
test.describe.configure({ timeout: 300_000 })

/** `YYMMDD` of a calendar date, as MT940 writes it. */
function mt940Date(date: string): string {
  return `${date.slice(2, 4)}${date.slice(5, 7)}${date.slice(8, 10)}`
}

/** `DD.MM.YYYY` of a calendar date, as Polish CSV exports write it. */
function csvDate(date: string): string {
  return `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}`
}

async function storedTransfers(importId: string | undefined): Promise<number> {
  const rows = await withClient((client) =>
    client.query('select id from payments_bank_transactions where import_id = $1', [String(importId)]),
  )
  return rows.rowCount ?? 0
}

test('TEST-081 a repeated MT940 and an overlapping CSV with regenerated references store nothing twice', async ({
  request,
}) => {
  const club = await createClub(request, 'test-081')
  try {
    const admin = club.adminToken
    const first = calendarDate(-3)
    const second = calendarDate(-2)
    const third = calendarDate(-1)

    // MT940: three credits with their bank references in `:61:`, one debit.
    const mt940 = [
      ':20:STMT-081',
      ':25:PL61109010140000071219812874',
      ':28C:1/1',
      `:60F:C${mt940Date(first)}PLN1000,00`,
      `:61:${mt940Date(first)}${mt940Date(first).slice(2)}C150,00NTRFNONREF//MT0810001`,
      ':86:020~20Darowizna wiosenna~32JAN KOWALSKI~38PL11222233334444555566667777',
      `:61:${mt940Date(first)}${mt940Date(first).slice(2)}C75,50NTRFNONREF//MT0810002`,
      ':86:020~20Wpłata na obóz~32EWA NOWAK~38PL21222233334444555566667777',
      `:61:${mt940Date(second)}${mt940Date(second).slice(2)}C200,00NTRFNONREF//MT0810003`,
      ':86:020~20Sponsoring turnieju~32FIRMA XYZ~38PL31222233334444555566667777',
      `:61:${mt940Date(second)}${mt940Date(second).slice(2)}D20,00NTRFNONREF//MT0810004`,
      ':86:020~20Piłki~32SKLEP SPORTOWY',
      `:62F:C${mt940Date(second)}PLN1405,50`,
      '-',
    ].join('\r\n')
    const once = await importStatement(request, admin, mt940, {}, 'wyciag.sta')
    expect(once.status, JSON.stringify(once.body)).toBe(201)
    expect(once.body).toMatchObject({ format: 'mt940', total: 4, unmatched: 3, debits: 1, duplicates: 0 })
    expect(await storedTransfers(once.body?.importId)).toBe(3)
    expect((await bankTransfers(request, admin)).body?.counts.all).toBe(3)

    const twice = await importStatement(request, admin, mt940, {}, 'wyciag.sta')
    expect(twice.status, JSON.stringify(twice.body)).toBe(201)
    expect(twice.body).toMatchObject({
      format: 'mt940',
      total: 4,
      booked: 0,
      suggested: 0,
      unmatched: 0,
      debits: 1,
      duplicates: 3,
    })
    expect(await storedTransfers(twice.body?.importId)).toBe(0)
    expect((await bankTransfers(request, admin)).body?.counts.all).toBe(3)

    // CSV: the bank's transaction id is a column of its own; the export of a later period regenerates it.
    const header = 'Data;Kwota;Nadawca;Tytuł;Rachunek;Identyfikator transakcji'
    const rows = [
      [csvDate(second), '120,00', 'Anna Lis', 'Składka Ola', 'PL41222233334444555566667777'],
      [csvDate(second), '60,00', 'Basia Kot', 'Opłata za koszulkę', 'PL51222233334444555566667777'],
      [csvDate(third), '45,00', 'Celina Zając', 'Wpisowe Tomek', 'PL61222233334444555566667777'],
    ]
    const earlier = [header, ...rows.map((row, index) => [...row, `CSV-A-${String(index + 1)}`].join(';'))].join('\n')
    const earlierImport = await importStatement(request, admin, earlier, {}, 'eksport-1.csv')
    expect(earlierImport.status, JSON.stringify(earlierImport.body)).toBe(201)
    expect(earlierImport.body).toMatchObject({ format: 'csv', total: 3, unmatched: 3, duplicates: 0 })
    expect(await storedTransfers(earlierImport.body?.importId)).toBe(3)
    expect((await bankTransfers(request, admin)).body?.counts.all).toBe(6)

    const fresh = [csvDate(third), '99,00', 'Dorota Wilk', 'Darowizna jesienna', 'PL71222233334444555566667777']
    const overlapping = [
      header,
      ...rows.map((row, index) => [...row, `CSV-B-${String(index + 101)}`].join(';')),
      [...fresh, 'CSV-B-200'].join(';'),
    ].join('\n')
    const overlapImport = await importStatement(request, admin, overlapping, {}, 'eksport-2.csv')
    expect(overlapImport.status, JSON.stringify(overlapImport.body)).toBe(201)
    expect(overlapImport.body).toMatchObject({ format: 'csv', total: 4, unmatched: 1, duplicates: 3 })
    expect(await storedTransfers(overlapImport.body?.importId)).toBe(1)
    const list = await bankTransfers(request, admin)
    expect(list.body?.counts.all).toBe(7)
    expect(list.body?.items.filter((item) => item.title === 'Darowizna jesienna')).toHaveLength(1)
    for (const title of ['Składka Ola', 'Opłata za koszulkę', 'Wpisowe Tomek']) {
      expect(list.body?.items.filter((item) => item.title === title)).toHaveLength(1)
    }

    // The history lists the four imports.
    expect((await bankImports(request, admin)).body?.total).toBe(4)
  } finally {
    await club.cleanup()
  }
})
