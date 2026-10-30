// Minimal XLSX reader for the family import: the first sheet's cell values only (no styles, no formulas evaluated).
// An uploaded workbook is untrusted, so every part is inflated through a byte-counting stream (a zip bomb stops at
// the budget instead of filling memory) and any part with a DOCTYPE is refused before parsing (no entity tricks).
import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'
import {
  IMPORT_MAX_COLUMNS,
  IMPORT_MAX_UNCOMPRESSED_BYTES,
  IMPORT_MAX_ZIP_ENTRIES,
  buildSheet,
  normalizeCell,
  type ImportCell,
  type ImportReadProblem,
  type ImportReadResult,
  type RawRow,
} from './import-sheet'

// `internalStream` exists at runtime (JSZip 3.x) but is missing from the bundled typings.
type ZipStream = {
  on(event: 'data', listener: (chunk: Uint8Array) => void): ZipStream
  on(event: 'error', listener: (error: unknown) => void): ZipStream
  on(event: 'end', listener: () => void): ZipStream
  pause(): ZipStream
  resume(): ZipStream
}
type StreamableEntry = { internalStream(type: 'uint8array'): ZipStream }
type Budget = { left: number }

class ImportFailure extends Error {
  constructor(readonly problem: ImportReadProblem) {
    super(problem)
  }
}

const REPEATED_ELEMENTS = new Set(['sheet', 'Relationship', 'si', 'r', 'row', 'c'])
// Entities are decoded by `decodeXml` below, so the parser never expands anything on its own.
const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: false,
  processEntities: false,
  isArray: (name) => REPEATED_ELEMENTS.has(name),
})

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as const
type NamedEntity = keyof typeof NAMED_ENTITIES
const ENTITY_PATTERN = /&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g

/** Decodes the five predefined XML entities and numeric references (`&#261;`, `&#x105;`) in one pass. */
function decodeXml(text: string): string {
  return text.replace(ENTITY_PATTERN, (_match, entity: string) =>
    // `Number('0x105')` reads hex and `Number('0261')` decimal, so one conversion serves both forms.
    entity.startsWith('#')
      ? String.fromCodePoint(Number(`0${entity.slice(1)}`))
      : NAMED_ENTITIES[entity as NamedEntity],
  )
}

type XmlNode = Record<string, unknown>
const asNode = (value: unknown): XmlNode => (typeof value === 'object' && value !== null ? (value as XmlNode) : {})
const child = (value: unknown, name: string): unknown => asNode(value)[name]
const children = (value: unknown, name: string): unknown[] => {
  const found = asNode(value)[name]
  return Array.isArray(found) ? found : []
}
const attr = (value: unknown, name: string): string | undefined => {
  const found = asNode(value)[`@_${name}`]
  return typeof found === 'string' ? decodeXml(found) : undefined
}
/** Text of an element: a plain string, or `#text` when the element also has attributes (`xml:space`). */
const textOf = (value: unknown): string => {
  const raw = typeof value === 'string' ? value : asNode(value)['#text']
  return typeof raw === 'string' ? decodeXml(raw) : ''
}
/** `<t>` directly, or rich-text runs `<r><t>` concatenated (shared strings and inline strings alike). */
const richText = (value: unknown): string =>
  textOf(child(value, 't')) +
  children(value, 'r')
    .map((run) => textOf(child(run, 't')))
    .join('')

async function readEntry(entry: JSZip.JSZipObject, budget: Budget): Promise<string> {
  // Streaming decode keeps multi-byte letters intact when they straddle a chunk boundary.
  const decoder = new TextDecoder()
  let text = ''
  await new Promise<void>((resolve, reject) => {
    const stream = (entry as unknown as StreamableEntry).internalStream('uint8array')
    stream
      .on('data', (chunk) => {
        budget.left -= chunk.length
        if (budget.left < 0) {
          stream.pause()
          reject(new ImportFailure('too_large'))
          return
        }
        text += decoder.decode(chunk, { stream: true })
      })
      .on('error', reject)
      .on('end', resolve)
      .resume()
  })
  text += decoder.decode()
  if (/<!DOCTYPE/i.test(text)) throw new ImportFailure('malformed')
  return text
}

async function readPart(zip: JSZip, path: string, budget: Budget): Promise<unknown> {
  const entry = zip.file(path)
  if (entry === null) throw new ImportFailure('malformed')
  return parser.parse(await readEntry(entry, budget))
}

/** Column letters to a 0-based index: `A` → 0, `Z` → 25, `AA` → 26. */
function columnIndex(letters: string): number {
  const upper = letters.toUpperCase()
  let index = 0
  for (let i = 0; i < upper.length; i++) index = index * 26 + upper.charCodeAt(i) - 64
  return index - 1
}

function cellValue(cell: unknown, sharedStrings: ReadonlyMap<string, string>): ImportCell {
  const value = textOf(child(cell, 'v'))
  switch (attr(cell, 't')) {
    case 's':
      return sharedStrings.get(value) ?? null
    case 'inlineStr':
      return richText(child(cell, 'is'))
    case 'str':
    case 'd':
      return value
    case 'b':
      return value === '1'
    case 'e':
      return null
    case undefined:
    default: {
      if (value.trim() === '') return null
      const number = Number(value)
      return Number.isFinite(number) ? number : null
    }
  }
}

function sheetRows(worksheet: unknown, sharedStrings: ReadonlyMap<string, string>): RawRow[] {
  const rows: RawRow[] = []
  let nextRowNo = 1
  for (const row of children(child(worksheet, 'sheetData'), 'row')) {
    const rowRef = attr(row, 'r')
    const rowNo = rowRef === undefined ? nextRowNo : Number(rowRef)
    nextRowNo = rowNo + 1
    const cells: ImportCell[] = []
    let nextColumn = 0
    for (const cell of children(row, 'c')) {
      // A cell without a reference (or without column letters in it) follows the previous one.
      const letters = (attr(cell, 'r') ?? '').replace(/[^A-Za-z].*$/s, '')
      const column = letters === '' ? nextColumn : columnIndex(letters)
      nextColumn = column + 1
      const value = normalizeCell(cellValue(cell, sharedStrings))
      if (value === null) continue
      // Checked here, not only in buildSheet, so a cell at column XFD cannot make every row a 16k-slot array.
      if (column >= IMPORT_MAX_COLUMNS) throw new ImportFailure('too_many_columns')
      while (cells.length < column) cells.push(null)
      cells[column] = value
    }
    rows.push({ rowNo, cells })
  }
  return rows
}

/** Reads the first worksheet of an XLSX workbook. */
export async function readXlsx(bytes: Uint8Array): Promise<ImportReadResult> {
  try {
    const zip = await JSZip.loadAsync(bytes)
    if (Object.keys(zip.files).length > IMPORT_MAX_ZIP_ENTRIES) return { ok: false, problem: 'too_large' }
    const budget: Budget = { left: IMPORT_MAX_UNCOMPRESSED_BYTES }

    const workbook = child(await readPart(zip, 'xl/workbook.xml', budget), 'workbook')
    const date1904Flag = attr(child(workbook, 'workbookPr'), 'date1904')
    const sheetRelId = attr(children(child(workbook, 'sheets'), 'sheet')[0], 'id')
    if (sheetRelId === undefined) throw new ImportFailure('malformed')

    const rels = child(await readPart(zip, 'xl/_rels/workbook.xml.rels', budget), 'Relationships')
    const relation = children(rels, 'Relationship').find((rel) => attr(rel, 'Id') === sheetRelId)
    const target = attr(relation, 'Target')
    if (target === undefined) throw new ImportFailure('malformed')

    const sharedEntry = zip.file('xl/sharedStrings.xml')
    const sharedXml = sharedEntry === null ? '' : await readEntry(sharedEntry, budget)
    const worksheet = child(
      await readPart(zip, target.startsWith('/') ? target.slice(1) : `xl/${target}`, budget),
      'worksheet',
    )
    // Keyed by the index exactly as a cell's `<v>` spells it.
    const sharedStrings = new Map(
      children(child(parser.parse(sharedXml), 'sst'), 'si').map((item, index) => [String(index), richText(item)]),
    )

    return buildSheet('xlsx', sheetRows(worksheet, sharedStrings), date1904Flag === '1' || date1904Flag === 'true')
  } catch (error) {
    return { ok: false, problem: error instanceof ImportFailure ? error.problem : 'malformed' }
  }
}
