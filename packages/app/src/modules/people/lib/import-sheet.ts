// Shared shape and limits of a spreadsheet read for the family import, and the step that turns raw records
// (from the CSV or the XLSX reader) into a header plus data rows. Pure: no I/O, runs on the server and in the browser.

/** A cell value as read: text, a number (XLSX numeric cell), a boolean, or null when empty. */
export type ImportCell = string | number | boolean | null
/** `rowNo` is the 1-based position in the file (CSV record number, XLSX row `r`), blank rows included. */
export type ImportRow = { rowNo: number; cells: ImportCell[] }
export type ImportSheet = { header: string[]; rows: ImportRow[]; date1904: boolean }
export type ImportFormat = 'csv' | 'xlsx'
export type ImportReadProblem =
  | 'empty' // zero bytes, or no header row / only blank rows
  | 'format_unsupported' // neither a zip (xlsx) nor UTF-8 text (csv): legacy .xls, PDF, binary
  | 'too_large' // over IMPORT_MAX_FILE_BYTES, or the zip-bomb guards tripped
  | 'too_many_rows' // more than IMPORT_MAX_ROWS data rows
  | 'too_many_columns' // more than IMPORT_MAX_COLUMNS columns in the header or any row
  | 'malformed' // broken zip, missing workbook parts, DOCTYPE in XML, unterminated CSV quote
export type ImportReadResult =
  { ok: true; format: ImportFormat; sheet: ImportSheet } | { ok: false; problem: ImportReadProblem }

export const IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024
/** Data rows; the header and blank rows do not count. */
export const IMPORT_MAX_ROWS = 1000
export const IMPORT_MAX_COLUMNS = 100
export const IMPORT_MAX_ZIP_ENTRIES = 500
/** Total inflated bytes over the XLSX parts actually read. */
export const IMPORT_MAX_UNCOMPRESSED_BYTES = 30 * 1024 * 1024
/** Longer text is cut to this length, not refused. */
export const IMPORT_MAX_CELL_LENGTH = 1000

/** A record as a reader produced it, before header detection and blank-row skipping. */
export type RawRow = { rowNo: number; cells: ImportCell[] }

/** Empty or whitespace-only text is no value; other text is kept as read, only cut to the length limit. */
export function normalizeCell(cell: ImportCell): ImportCell {
  if (typeof cell !== 'string') return cell
  return cell.trim() === '' ? null : cell.slice(0, IMPORT_MAX_CELL_LENGTH)
}

/**
 * Picks the first non-blank record as the header and keeps the non-blank records after it as data rows, padded to
 * the header's width. Trailing empty cells do not count as columns (spreadsheets often carry formatted empty cells).
 */
export function buildSheet(format: ImportFormat, rawRows: readonly RawRow[], date1904: boolean): ImportReadResult {
  let header: string[] | null = null
  const rows: ImportRow[] = []
  for (const raw of rawRows) {
    const cells = raw.cells.map(normalizeCell)
    while (cells.length > 0 && cells[cells.length - 1] === null) cells.pop()
    if (cells.length > IMPORT_MAX_COLUMNS) return { ok: false, problem: 'too_many_columns' }
    if (cells.length === 0) continue
    if (header === null) {
      header = cells.map((cell) => (cell === null ? '' : String(cell).trim()))
      continue
    }
    if (rows.length === IMPORT_MAX_ROWS) return { ok: false, problem: 'too_many_rows' }
    while (cells.length < header.length) cells.push(null)
    rows.push({ rowNo: raw.rowNo, cells })
  }
  if (header === null) return { ok: false, problem: 'empty' }
  return { ok: true, format, sheet: { header, rows, date1904 } }
}
