// Entry point of the family import's file reading: picks CSV or XLSX from the bytes themselves (a file name or MIME
// type from the browser cannot be trusted) and returns the first sheet as a header plus data rows.
import { readCsv } from './import-csv'
import { IMPORT_MAX_FILE_BYTES, type ImportFormat, type ImportReadResult } from './import-sheet'
import { readXlsx } from './import-xlsx'

export {
  IMPORT_MAX_CELL_LENGTH,
  IMPORT_MAX_COLUMNS,
  IMPORT_MAX_FILE_BYTES,
  IMPORT_MAX_ROWS,
  IMPORT_MAX_UNCOMPRESSED_BYTES,
  IMPORT_MAX_ZIP_ENTRIES,
  type ImportCell,
  type ImportFormat,
  type ImportReadProblem,
  type ImportReadResult,
  type ImportRow,
  type ImportSheet,
} from './import-sheet'
export { readCsv } from './import-csv'
export { readXlsx } from './import-xlsx'

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]

const isZip = (bytes: Uint8Array): boolean => ZIP_MAGIC.every((byte, index) => bytes[index] === byte)

/** Strict UTF-8 text without NUL bytes; anything else (legacy .xls, PDF, images) is not a CSV. */
function decodeText(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return null
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

/** Format by magic bytes: 'xlsx' for a zip (PK\x03\x04), 'csv' for valid UTF-8 text without NUL bytes, else null. */
export function detectImportFormat(bytes: Uint8Array): ImportFormat | null {
  if (bytes.length === 0) return null
  if (isZip(bytes)) return 'xlsx'
  return decodeText(bytes) === null ? null : 'csv'
}

/** Detects the format from the bytes (never from the name) and reads the first sheet. */
export async function readImportFile(bytes: Uint8Array): Promise<ImportReadResult> {
  if (bytes.length === 0) return { ok: false, problem: 'empty' }
  if (bytes.length > IMPORT_MAX_FILE_BYTES) return { ok: false, problem: 'too_large' }
  if (isZip(bytes)) return await readXlsx(bytes)
  const text = decodeText(bytes)
  return text === null ? { ok: false, problem: 'format_unsupported' } : readCsv(text)
}
