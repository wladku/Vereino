// Lenient RFC 4180 reader for the family import. Polish spreadsheet programs save CSV with `;` because `,` is the
// decimal separator, so the delimiter is detected from the header line instead of being assumed.
import { buildSheet, type ImportCell, type ImportReadResult, type RawRow } from './import-sheet'

type Delimiter = ',' | ';'

/** Counts `,` and `;` outside quotes on the first line that has any content; `;` wins only when it is more frequent. */
function detectDelimiter(text: string): Delimiter {
  let inQuotes = false
  let seenContent = false
  let commas = 0
  let semicolons = 0
  for (const ch of text) {
    if (ch === '"') {
      inQuotes = !inQuotes
      seenContent = true
    } else if (inQuotes) continue
    else if (ch === '\n' || ch === '\r') {
      if (seenContent) break
    } else {
      if (ch === ',') commas++
      if (ch === ';') semicolons++
      seenContent ||= ch.trim() !== ''
    }
  }
  return semicolons > commas ? ';' : ','
}

/** Reads decoded CSV text; records end at CRLF, LF or a lone CR outside quotes. */
export function readCsv(text: string): ImportReadResult {
  const source = text.startsWith('﻿') ? text.slice(1) : text
  const delimiter = detectDelimiter(source)
  const rows: RawRow[] = []
  let cells: ImportCell[] = []
  let field = ''
  let atFieldStart = true
  let inQuotes = false
  let recordNo = 1
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]
    if (inQuotes) {
      if (ch !== '"') field += ch
      else if (source[i + 1] === '"') {
        field += '"'
        i++
      } else inQuotes = false
    } else if (ch === '"' && atFieldStart) {
      inQuotes = true
      atFieldStart = false
    } else if (ch === delimiter) {
      cells.push(field)
      field = ''
      atFieldStart = true
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && source[i + 1] === '\n') i++
      cells.push(field)
      rows.push({ rowNo: recordNo++, cells })
      cells = []
      field = ''
      atFieldStart = true
    } else {
      field += ch
      atFieldStart = false
    }
  }
  if (inQuotes) return { ok: false, problem: 'malformed' }
  if (!atFieldStart || cells.length > 0) {
    cells.push(field)
    rows.push({ rowNo: recordNo, cells })
  }
  return buildSheet('csv', rows, false)
}
