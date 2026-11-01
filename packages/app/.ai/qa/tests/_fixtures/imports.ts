// Helpers of the bulk import integration tests (#28, club spec TEST-051; REQ-036, DD-38): the families sheet as CSV and
// as an XLSX built in the test with JSZip (no binary fixture is committed), the import API, the purge job through
// its module CLI and raw reads of the staged rows and the stored file.
import { expect, type APIRequestContext } from '@playwright/test'
import JSZip from 'jszip'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { OPTIMISTIC_LOCK_HEADER, call, mercato, type Club } from './club'

// Synthetic numbers with valid check digits (engineering standards S5.9: no real PESEL in test data).
export const PESEL_EXISTING_CHILD = '15250612347'
export const PESEL_RENAMED_CHILD = '10310112346'
export const PESEL_NEW_CHILD = '02220312343'
export const PESEL_BAD_DATE_CHILD = '88070512340'

export const FAMILY_HEADER = [
  'Imię dziecka',
  'Nazwisko dziecka',
  'Data urodzenia',
  'PESEL',
  'Imię rodzica',
  'Nazwisko rodzica',
  'E-mail rodzica',
  'Telefon rodzica',
  'Grupa',
]

/** The mapping the page suggests for `FAMILY_HEADER` (and the tests send). */
export const FAMILY_MAPPING = {
  'participant.firstName': 0,
  'participant.lastName': 1,
  'participant.birthDate': 2,
  'participant.pesel': 3,
  'guardian1.firstName': 4,
  'guardian1.lastName': 5,
  'guardian1.email': 6,
  'guardian1.phone': 7,
  group: 8,
}

export type SheetCell = string | number | null

/**
 * TEST-051's six rows (rows 2–7 of the sheet): a new family, a family already in the club (same PESEL), a child with
 * a changed surname (same PESEL), a row without a PESEL or identifier, a row with a bad date, and a repeat of row 2.
 */
export function familyRows(dates: { newChild: SheetCell; noIdentifier: SheetCell } = defaultDates): SheetCell[][] {
  const newFamily: SheetCell[] = [
    'Ola',
    'Nowa',
    dates.newChild,
    PESEL_NEW_CHILD,
    'Anna',
    'Nowa',
    'anna.nowa@example.org',
    '+48 600 100 200',
    'Orliki U8',
  ]
  return [
    newFamily,
    ['Zofia', 'Kowalska', '2015-06-12', PESEL_EXISTING_CHILD, 'Maria', 'Kowalska', null, null, null],
    ['Tomasz', 'Nowak-Wiśniewski', '2010-11-01', PESEL_RENAMED_CHILD, null, null, null, null, null],
    ['Jan', 'Bezpeselu', dates.noIdentifier, null, 'Ewa', 'Bezpeselu', 'ewa.b@example.org', null, null],
    ['Piotr', 'Zły', '31.02.2015', PESEL_BAD_DATE_CHILD, 'Adam', 'Zły', null, null, null],
    [...newFamily],
  ]
}

const defaultDates = { newChild: '2016-05-01', noIdentifier: '15.03.2017' }

function csvCell(cell: SheetCell): string {
  if (cell === null) return ''
  const text = String(cell)
  return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** A UTF-8 CSV with a BOM and `;` delimiters, as a Polish Excel exports it. */
export function familiesCsv(rows: SheetCell[][] = familyRows()): Buffer {
  const lines = [FAMILY_HEADER, ...rows].map((row) => row.map(csvCell).join(';'))
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(`${lines.join('\r\n')}\r\n`, 'utf8')])
}

function columnName(index: number): string {
  return String.fromCharCode(65 + index)
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * A minimal XLSX of the same sheet: text as shared strings (the header) or inline strings (the rows), numbers as
 * numeric cells — an Excel serial date or a PESEL that lost its leading zero stay numbers.
 */
export async function familiesXlsx(rows: SheetCell[][]): Promise<Buffer> {
  const shared = FAMILY_HEADER.map((name) => `<si><t>${escapeXml(name)}</t></si>`).join('')
  const headerCells = FAMILY_HEADER.map((_, index) => `<c r="${columnName(index)}1" t="s"><v>${String(index)}</v></c>`)
  const body = rows
    .map((row, rowIndex) => {
      const r = rowIndex + 2
      const cells = row
        .map((cell, index) => {
          const ref = `${columnName(index)}${String(r)}`
          if (cell === null) return ''
          if (typeof cell === 'number') return `<c r="${ref}"><v>${String(cell)}</v></c>`
          return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(cell)}</t></is></c>`
        })
        .join('')
      return `<row r="${String(r)}">${cells}</row>`
    })
    .join('')
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>',
  )
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  )
  zip.file(
    'xl/workbook.xml',
    '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Rodziny" sheetId="1" r:id="rId1"/></sheets></workbook>',
  )
  zip.file(
    'xl/_rels/workbook.xml.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>',
  )
  zip.file(
    'xl/sharedStrings.xml',
    `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${String(FAMILY_HEADER.length)}" uniqueCount="${String(FAMILY_HEADER.length)}">${shared}</sst>`,
  )
  zip.file(
    'xl/worksheets/sheet1.xml',
    `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">${headerCells.join('')}</row>${body}</sheetData></worksheet>`,
  )
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

export type ImportView = {
  id: string
  status: 'previewed' | 'committed' | 'cancelled'
  fileFormat: 'csv' | 'xlsx'
  rowCount: number
  summary: Record<string, number>
  createdBy: { personId: string; name: string | null }
  committedBy: { personId: string; name: string | null } | null
  committedAt: string | null
  purgedAt: string | null
  fileAvailable: boolean
  pendingDecisions: number
  canCreateMemberships: boolean
  updatedAt: string
  code?: string
}

export type ImportRowView = {
  id: string
  rowNo: number
  classification: 'new' | 'matched' | 'review' | 'error'
  decision: 'match' | 'create' | 'skip' | null
  matchedPerson: { personId: string; name: string | null } | null
  errorCode: string | null
  errorColumn: string | null
  reviewReason: string | null
  needsDecision: boolean
  groupName: string | null
  membershipStatus: string | null
  membershipPreview: string | null
  committedAt: string | null
  values: { persons: Record<string, Record<string, string | null>>; group: string | null } | null
  updatedAt: string
}

export type UploadFile = { name: string; mimeType: string; buffer: Buffer }

export const csvFile = (buffer: Buffer = familiesCsv()): UploadFile => ({
  name: 'rodziny.csv',
  mimeType: 'text/csv',
  buffer,
})

export const xlsxFile = (buffer: Buffer): UploadFile => ({
  name: 'rodziny.xlsx',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  buffer,
})

/** `POST /api/people/imports` (multipart `file` + `mapping`). */
export async function uploadImport(
  request: APIRequestContext,
  token: string,
  file: UploadFile,
  mapping: Record<string, number> = FAMILY_MAPPING,
): Promise<{ status: number; body: (ImportView & { problem?: string }) | null }> {
  const response = await request.fetch('/api/people/imports', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    multipart: { file, mapping: JSON.stringify(mapping) },
    timeout: 60_000,
  })
  let body: (ImportView & { problem?: string }) | null = null
  try {
    body = (await response.json()) as ImportView & { problem?: string }
  } catch {
    body = null
  }
  return { status: response.status(), body }
}

export async function previewImport(request: APIRequestContext, token: string, file: UploadFile): Promise<ImportView> {
  const result = await uploadImport(request, token, file)
  expect(result.status, `POST /api/people/imports ${JSON.stringify(result.body)}`).toBe(201)
  return result.body as ImportView
}

export async function getImport(request: APIRequestContext, token: string, id: string) {
  return call<ImportView>(request, 'GET', `/api/people/imports/${id}`, token)
}

export async function importRows(
  request: APIRequestContext,
  token: string,
  id: string,
  query = '',
): Promise<ImportRowView[]> {
  const result = await call<{ items?: ImportRowView[] }>(
    request,
    'GET',
    `/api/people/imports/${id}/rows?pageSize=100${query}`,
    token,
  )
  expect(result.status, JSON.stringify(result.body)).toBe(200)
  return result.body?.items ?? []
}

export async function decideRow(
  request: APIRequestContext,
  token: string,
  importId: string,
  row: Pick<ImportRowView, 'id' | 'updatedAt'>,
  decision: { action: 'match' | 'create' | 'skip'; personId?: string },
  lockToken: string | null = row.updatedAt,
) {
  return call<{ decision?: string; updatedAt?: string; code?: string }>(
    request,
    'PUT',
    `/api/people/imports/${importId}/rows/${row.id}`,
    token,
    { data: decision, headers: lockToken ? { [OPTIMISTIC_LOCK_HEADER]: lockToken } : {} },
  )
}

export async function importAction(
  request: APIRequestContext,
  token: string,
  id: string,
  action: 'commit' | 'cancel',
  lockToken: string | null,
) {
  return call<ImportView & { code?: string; rowNos?: number[] }>(
    request,
    'POST',
    `/api/people/imports/${id}/${action}`,
    token,
    { headers: lockToken ? { [OPTIMISTIC_LOCK_HEADER]: lockToken } : {} },
  )
}

/** Runs `people purge-import-rows` for the club as of `now`; returns the job's counts. */
export function purgeImports(
  scope: { tenantId: string; organizationId: string },
  now: string,
): { counts?: { imports: number; rows: number; files: number; failed: number } } {
  const result = mercato([
    'people',
    'purge-import-rows',
    '--tenant',
    scope.tenantId,
    '--org',
    scope.organizationId,
    '--now',
    now,
  ]) as { counts?: { imports: number; rows: number; files: number; failed: number } } | null
  if (!result) throw new Error('[internal] people purge-import-rows printed no result')
  return result
}

/** The staged rows as stored (ciphertext), for the encryption and purge checks. */
export async function rawImportRows(importId: string) {
  return withClient(async (client) => {
    const { rows } = await client.query<{ row_no: number; raw: string | null; membership_status: string | null }>(
      'select row_no, raw, membership_status from people_import_rows where import_id = $1 order by row_no',
      [importId],
    )
    return rows
  })
}

/** The import file's attachment row and partition, or undefined once it is released. */
export async function rawImportFile(importId: string) {
  return withClient(async (client) => {
    const { rows } = await client.query<{ id: string; partition_code: string; entity_id: string }>(
      'select id, partition_code, entity_id from attachments where record_id = $1',
      [importId],
    )
    return rows[0]
  })
}

/** Rows by their sheet row number. */
export function byRowNo(rows: readonly ImportRowView[]): Map<number, ImportRowView> {
  return new Map(rows.map((row) => [row.rowNo, row]))
}

export function classifications(rows: readonly ImportRowView[]): [number, string, string | null][] {
  return rows.map((row) => [row.rowNo, row.classification, row.errorCode])
}

export type { Club }
