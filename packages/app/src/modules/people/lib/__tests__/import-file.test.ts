import { describe, expect, it } from '@jest/globals'
import JSZip from 'jszip'
import {
  IMPORT_MAX_CELL_LENGTH,
  IMPORT_MAX_COLUMNS,
  IMPORT_MAX_FILE_BYTES,
  IMPORT_MAX_ROWS,
  IMPORT_MAX_UNCOMPRESSED_BYTES,
  IMPORT_MAX_ZIP_ENTRIES,
  detectImportFormat,
  readCsv,
  readImportFile,
  readXlsx,
  type ImportReadResult,
  type ImportSheet,
} from '../import-file'

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text)

function sheetOf(result: ImportReadResult): ImportSheet {
  if (!result.ok) throw new Error(`expected a sheet, got ${result.problem}`)
  return result.sheet
}

const WORKBOOK = (body = '<sheets><sheet name="Rodziny" sheetId="1" r:id="rId1"/></sheets>') =>
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
  `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${body}</workbook>`

const RELS = (target = 'worksheets/sheet1.xml') =>
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="${target}"/>` +
  '</Relationships>'

const SHEET = (rows: string) =>
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`

const SHARED = (items: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${items}</sst>`

type Parts = { [path: string]: string | null | undefined }

/** Assembles a minimal workbook; a part set to null is left out, extra paths are added as given. */
async function xlsx(rows: string, parts: Parts = {}): Promise<Uint8Array> {
  const all: Parts = {
    'xl/workbook.xml': WORKBOOK(),
    'xl/_rels/workbook.xml.rels': RELS(),
    'xl/worksheets/sheet1.xml': SHEET(rows),
    ...parts,
  }
  const zip = new JSZip()
  for (const [path, content] of Object.entries(all)) {
    if (typeof content === 'string') zip.file(path, content)
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

const HEADER_ROW = '<row r="1"><c r="A1" t="inlineStr"><is><t>Nazwisko</t></is></c></row>'

describe('detectImportFormat', () => {
  it('recognises a zip by its magic bytes', () => {
    expect(detectImportFormat(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]))).toBe('xlsx')
  })

  it('treats valid UTF-8 text as CSV', () => {
    expect(detectImportFormat(utf8('nazwisko;imię\nŻółć;Łucja\n'))).toBe('csv')
  })

  it('refuses a legacy .xls (OLE), NUL bytes, invalid UTF-8 and an empty file', () => {
    expect(detectImportFormat(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toBeNull()
    expect(detectImportFormat(new Uint8Array([0x61, 0x00, 0x62]))).toBeNull()
    expect(detectImportFormat(new Uint8Array([0x61, 0xc3, 0x28]))).toBeNull()
    expect(detectImportFormat(new Uint8Array())).toBeNull()
  })

  it('does not take a short "PK" text for a zip', () => {
    expect(detectImportFormat(utf8('PK'))).toBe('csv')
  })
})

describe('readImportFile', () => {
  it('refuses an empty file', async () => {
    await expect(readImportFile(new Uint8Array())).resolves.toEqual({ ok: false, problem: 'empty' })
  })

  it('refuses a file over the byte limit before reading it', async () => {
    const bytes = new Uint8Array(IMPORT_MAX_FILE_BYTES + 1).fill(0x61)
    await expect(readImportFile(bytes)).resolves.toEqual({ ok: false, problem: 'too_large' })
  })

  it('refuses bytes that are neither a zip nor UTF-8 text', async () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    await expect(readImportFile(ole)).resolves.toEqual({ ok: false, problem: 'format_unsupported' })
  })

  it('reads CSV bytes with a BOM', async () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('Nazwisko;Imię\nKowalski;Jan')])
    const result = await readImportFile(bytes)
    expect(result).toEqual({
      ok: true,
      format: 'csv',
      sheet: { header: ['Nazwisko', 'Imię'], rows: [{ rowNo: 2, cells: ['Kowalski', 'Jan'] }], date1904: false },
    })
  })

  it('reads XLSX bytes', async () => {
    const result = await readImportFile(await xlsx(`${HEADER_ROW}<row r="2"><c r="A2"><v>7</v></c></row>`))
    expect(result).toEqual({
      ok: true,
      format: 'xlsx',
      sheet: { header: ['Nazwisko'], rows: [{ rowNo: 2, cells: [7] }], date1904: false },
    })
  })
})

describe('readCsv', () => {
  it('reads a comma-separated file with LF line ends', () => {
    const sheet = sheetOf(readCsv('a,b,c\n1,2,3\n'))
    expect(sheet.header).toEqual(['a', 'b', 'c'])
    expect(sheet.rows).toEqual([{ rowNo: 2, cells: ['1', '2', '3'] }])
    expect(sheet.date1904).toBe(false)
  })

  it('detects a semicolon delimiter and keeps commas inside fields', () => {
    const sheet = sheetOf(readCsv('Nazwisko;Kwota\r\nNowak;12,50\r\n'))
    expect(sheet.header).toEqual(['Nazwisko', 'Kwota'])
    expect(sheet.rows).toEqual([{ rowNo: 2, cells: ['Nowak', '12,50'] }])
  })

  it('prefers the comma on a tie and ignores delimiters inside quotes when detecting', () => {
    expect(sheetOf(readCsv('a;b,c\n')).header).toEqual(['a;b', 'c'])
    expect(sheetOf(readCsv('"x;y;z",w\n1,2')).header).toEqual(['x;y;z', 'w'])
  })

  it('detects the delimiter from the first line with content, past leading blank lines', () => {
    const sheet = sheetOf(readCsv('\n  \r\na;b\n1;2'))
    expect(sheet.header).toEqual(['a', 'b'])
    expect(sheet.rows).toEqual([{ rowNo: 4, cells: ['1', '2'] }])
  })

  it('handles CRLF, LF and a lone CR as record ends', () => {
    const sheet = sheetOf(readCsv('h1,h2\r\na,b\nc,d\re,f'))
    expect(sheet.rows).toEqual([
      { rowNo: 2, cells: ['a', 'b'] },
      { rowNo: 3, cells: ['c', 'd'] },
      { rowNo: 4, cells: ['e', 'f'] },
    ])
  })

  it('reads quoted fields with delimiters, doubled quotes and line breaks', () => {
    const sheet = sheetOf(readCsv('name,note\n"Kowalski, Jan","He said ""hi""\r\nand left"\n'))
    expect(sheet.rows).toEqual([{ rowNo: 2, cells: ['Kowalski, Jan', 'He said "hi"\r\nand left'] }])
  })

  it('numbers records, not physical lines, after a multi-line field', () => {
    const sheet = sheetOf(readCsv('h\n"a\nb"\nc'))
    expect(sheet.rows.map((row) => row.rowNo)).toEqual([2, 3])
  })

  it('takes a quote inside an unquoted field literally, also after a closed quoted field', () => {
    const sheet = sheetOf(readCsv('h1,h2\n5" disk,"a"b"c'))
    expect(sheet.rows[0]?.cells).toEqual(['5" disk', 'ab"c'])
  })

  it('reports an unterminated quoted field as malformed', () => {
    expect(readCsv('h1,h2\n"open,x\n')).toEqual({ ok: false, problem: 'malformed' })
  })

  it('strips a leading BOM', () => {
    expect(sheetOf(readCsv('﻿Nazwisko\nNowak')).header).toEqual(['Nazwisko'])
  })

  it('skips blank rows but keeps the real row numbers', () => {
    const sheet = sheetOf(readCsv('\n;\nh1;h2\n\n ; \nx;y\n'))
    expect(sheet.header).toEqual(['h1', 'h2'])
    expect(sheet.rows).toEqual([{ rowNo: 6, cells: ['x', 'y'] }])
  })

  it('pads short rows, keeps longer rows and turns blank text into null without trimming the rest', () => {
    const sheet = sheetOf(readCsv('a,b,c\n x ,\n1,2,3,4\n"",  ,z'))
    expect(sheet.rows).toEqual([
      { rowNo: 2, cells: [' x ', null, null] },
      { rowNo: 3, cells: ['1', '2', '3', '4'] },
      { rowNo: 4, cells: [null, null, 'z'] },
    ])
  })

  it('trims header cells and keeps an empty one in the middle as an empty string', () => {
    expect(sheetOf(readCsv(' Imię ,,Nazwisko\n')).header).toEqual(['Imię', '', 'Nazwisko'])
  })

  it('reads a final record without a line end, including an empty last field and an empty quoted field', () => {
    expect(sheetOf(readCsv('a,b\n1,')).rows).toEqual([{ rowNo: 2, cells: ['1', null] }])
    expect(sheetOf(readCsv('a\nb\n""')).rows).toEqual([{ rowNo: 2, cells: ['b'] }])
  })

  it('reports a file without any non-blank row as empty', () => {
    expect(readCsv('')).toEqual({ ok: false, problem: 'empty' })
    expect(readCsv('\n , \n\n')).toEqual({ ok: false, problem: 'empty' })
  })

  it('cuts long text to the cell length limit', () => {
    const long = 'ą'.repeat(IMPORT_MAX_CELL_LENGTH + 5)
    const sheet = sheetOf(readCsv(`h\n${long}`))
    expect(sheet.rows[0]?.cells[0]).toBe('ą'.repeat(IMPORT_MAX_CELL_LENGTH))
  })

  it('accepts exactly the maximum number of data rows and refuses one more', () => {
    const body = (count: number) => Array.from({ length: count }, (_, index) => `r${String(index)}`).join('\n')
    expect(sheetOf(readCsv(`h\n\n${body(IMPORT_MAX_ROWS)}`)).rows).toHaveLength(IMPORT_MAX_ROWS)
    expect(readCsv(`h\n${body(IMPORT_MAX_ROWS + 1)}`)).toEqual({ ok: false, problem: 'too_many_rows' })
  })

  it('accepts exactly the maximum number of columns and refuses one more in the header or a row', () => {
    const line = (count: number) => Array.from({ length: count }, (_, index) => `c${String(index)}`).join(',')
    expect(sheetOf(readCsv(`${line(IMPORT_MAX_COLUMNS)}\n${line(IMPORT_MAX_COLUMNS)}`)).header).toHaveLength(
      IMPORT_MAX_COLUMNS,
    )
    expect(readCsv(line(IMPORT_MAX_COLUMNS + 1))).toEqual({ ok: false, problem: 'too_many_columns' })
    expect(readCsv(`h\n${line(IMPORT_MAX_COLUMNS + 1)}`)).toEqual({ ok: false, problem: 'too_many_columns' })
  })

  it('does not count trailing empty cells as columns', () => {
    const sheet = sheetOf(readCsv(`a,b${','.repeat(IMPORT_MAX_COLUMNS * 2)}\n1`))
    expect(sheet.header).toEqual(['a', 'b'])
    expect(sheet.rows).toEqual([{ rowNo: 2, cells: ['1', null] }])
  })
})

describe('readXlsx', () => {
  it('reads shared strings, rich text, inline strings and decodes entities and Polish letters', async () => {
    const shared = SHARED(
      '<si><t>Nazwisko</t></si>' +
        '<si><t>Imię</t></si>' +
        '<si><t>Żółć &amp; ł&#261;ka &#x119; &lt;b&gt; &quot;x&quot; &apos;y&apos; &amp;#261;</t></si>' +
        '<si><r><t>Ła</t></r><r><rPr><b/></rPr><t xml:space="preserve"> &#380;e</t></r></si>' +
        '<si><t xml:space="preserve">  spacje  </t></si>' +
        '<si><t></t></si>',
    )
    const rows =
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
      '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row>' +
      '<row r="3"><c r="A3" t="s"><v>4</v></c><c r="B3" t="s"><v>5</v></c></row>' +
      '<row r="4"><c r="A4" t="inlineStr"><is><t>Wąs &#322;</t></is></c>' +
      '<c r="B4" t="inlineStr"><is><r><t>a</t></r><r><t>b</t></r></is></c></row>' +
      '<row r="5"><c r="A5" t="s"><v>99</v></c><c r="B5" t="inlineStr"><is><t xml:space="preserve"></t></is></c></row>'
    const sheet = sheetOf(await readXlsx(await xlsx(rows, { 'xl/sharedStrings.xml': shared })))
    expect(sheet.header).toEqual(['Nazwisko', 'Imię'])
    expect(sheet.rows).toEqual([
      { rowNo: 2, cells: ['Żółć & łąka ę <b> "x" \'y\' &#261;', 'Ła że'] },
      { rowNo: 3, cells: ['  spacje  ', null] },
      { rowNo: 4, cells: ['Wąs ł', 'ab'] },
    ])
  })

  it('reads numbers, booleans, errors, dates, formula results and string formulas', async () => {
    const rows =
      '<row r="1"><c r="A1" t="inlineStr"><is><t>h</t></is></c></row>' +
      '<row r="2">' +
      '<c r="A2"><v>42</v></c>' +
      '<c r="B2" t="n"><v>1.5E-3</v></c>' +
      '<c r="C2" t="b"><v>1</v></c>' +
      '<c r="D2" t="b"><v>0</v></c>' +
      '<c r="E2" t="e"><v>#DIV/0!</v></c>' +
      '<c r="F2" t="d"><v>2026-10-30T00:00:00</v></c>' +
      '<c r="G2"><f>SUM(A2:B2)</f><v>42.0015</v></c>' +
      '<c r="H2" t="str"><f>A1&amp;"x"</f><v>hx</v></c>' +
      '<c r="I2" s="3"/>' +
      '<c r="J2"><v>abc</v></c>' +
      '<c r="K2"><v>45000</v></c>' +
      '</row>'
    const sheet = sheetOf(await readXlsx(await xlsx(rows)))
    expect(sheet.rows).toEqual([
      {
        rowNo: 2,
        cells: [42, 0.0015, true, false, null, '2026-10-30T00:00:00', 42.0015, 'hx', null, null, 45000],
      },
    ])
  })

  it('places sparse cells by their reference and pads the gaps', async () => {
    const rows =
      '<row r="1"><c r="A1" t="inlineStr"><is><t>a</t></is></c><c r="B1" t="inlineStr"><is><t>b</t></is></c>' +
      '<c r="C1" t="inlineStr"><is><t>c</t></is></c><c r="D1" t="inlineStr"><is><t>d</t></is></c>' +
      '<c r="E1" t="inlineStr"><is><t>e</t></is></c></row>' +
      '<row r="3"><c r="B3"><v>2</v></c><c r="D3"><v>4</v></c></row>'
    const sheet = sheetOf(await readXlsx(await xlsx(rows)))
    expect(sheet.rows).toEqual([{ rowNo: 3, cells: [null, 2, null, 4, null] }])
  })

  it('reads two-letter columns', async () => {
    const rows = `<row r="1"><c r="AB1" t="inlineStr"><is><t>far</t></is></c></row>`
    const sheet = sheetOf(await readXlsx(await xlsx(rows)))
    expect(sheet.header).toHaveLength(28)
    expect(sheet.header[27]).toBe('far')
  })

  it('numbers rows and columns without references by their position', async () => {
    const rows =
      '<row><c t="inlineStr"><is><t>a</t></is></c><c t="inlineStr"><is><t>b</t></is></c></row>' +
      '<row r="4"><c r="B4"><v>1</v></c><c><v>2</v></c></row>' +
      '<row><c r="7"><v>3</v></c></row>'
    const sheet = sheetOf(await readXlsx(await xlsx(rows)))
    expect(sheet.header).toEqual(['a', 'b'])
    expect(sheet.rows).toEqual([
      { rowNo: 4, cells: [null, 1, 2] },
      { rowNo: 5, cells: [3, null] },
    ])
  })

  it('stringifies numeric and boolean header cells', async () => {
    const rows = '<row r="2"><c r="A2"><v>2026</v></c><c r="C2" t="b"><v>1</v></c></row>'
    expect(sheetOf(await readXlsx(await xlsx(rows))).header).toEqual(['2026', '', 'true'])
  })

  it('reads the date1904 flag in both spellings', async () => {
    const workbook = (flag: string) =>
      WORKBOOK(`<workbookPr date1904="${flag}"/><sheets><sheet name="A" sheetId="1" r:id="rId1"/></sheets>`)
    for (const [flag, expected] of [
      ['1', true],
      ['true', true],
      ['0', false],
    ] as const) {
      const sheet = sheetOf(await readXlsx(await xlsx(HEADER_ROW, { 'xl/workbook.xml': workbook(flag) })))
      expect(sheet.date1904).toBe(expected)
    }
  })

  it('follows an absolute relationship target to the first sheet', async () => {
    const parts = {
      'xl/workbook.xml': WORKBOOK(
        '<sheets><sheet name="Pierwszy" sheetId="1" r:id="rId1"/><sheet name="Drugi" sheetId="2" r:id="rId2"/></sheets>',
      ),
      'xl/_rels/workbook.xml.rels': RELS('/xl/worksheets/first.xml'),
      'xl/worksheets/sheet1.xml': null,
      'xl/worksheets/first.xml': SHEET(HEADER_ROW),
    }
    expect(sheetOf(await readXlsx(await xlsx('', parts))).header).toEqual(['Nazwisko'])
  })

  it('reads a workbook whose elements carry a namespace prefix', async () => {
    const parts = {
      'xl/workbook.xml':
        '<x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<x:sheets><x:sheet name="A" sheetId="1" r:id="rId1"/></x:sheets></x:workbook>',
      'xl/worksheets/sheet1.xml':
        '<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData>' +
        '<x:row r="1"><x:c r="A1" t="inlineStr"><x:is><x:t>Imię</x:t></x:is></x:c></x:row></x:sheetData></x:worksheet>',
    }
    expect(sheetOf(await readXlsx(await xlsx('', parts))).header).toEqual(['Imię'])
  })

  it('reports a sheet without any value as empty', async () => {
    await expect(readXlsx(await xlsx('<row r="1"><c r="A1" s="1"/></row>'))).resolves.toEqual({
      ok: false,
      problem: 'empty',
    })
  })

  it('reports a value beyond the column limit as too many columns', async () => {
    const rows = `${HEADER_ROW}<row r="2"><c r="CW2"><v>1</v></c></row>`
    await expect(readXlsx(await xlsx(rows))).resolves.toEqual({ ok: false, problem: 'too_many_columns' })
    const lastAllowed = `<row r="1"><c r="CV1"><v>1</v></c><c r="XFD1" s="2"/></row>`
    expect(sheetOf(await readXlsx(await xlsx(lastAllowed))).header).toHaveLength(IMPORT_MAX_COLUMNS)
  })

  it.each([
    ['the workbook', { 'xl/workbook.xml': null }],
    ['the workbook relationships', { 'xl/_rels/workbook.xml.rels': null }],
    ['the worksheet', { 'xl/worksheets/sheet1.xml': null }],
    ['any sheet in the workbook', { 'xl/workbook.xml': WORKBOOK('<sheets/>') }],
    ['the relationship of the first sheet', { 'xl/_rels/workbook.xml.rels': RELS().replace('rId1', 'rId9') }],
  ])('reports a workbook without %s as malformed', async (_label, parts: Parts) => {
    await expect(readXlsx(await xlsx(HEADER_ROW, parts))).resolves.toEqual({ ok: false, problem: 'malformed' })
  })

  it('refuses any part with a DOCTYPE, whatever its case', async () => {
    const doctype = '<!doctype sst [<!ENTITY lol "lol">]>'
    const parts = { 'xl/sharedStrings.xml': `${doctype}${SHARED('<si><t>&lol;</t></si>')}` }
    await expect(readXlsx(await xlsx(HEADER_ROW, parts))).resolves.toEqual({ ok: false, problem: 'malformed' })
    const sheet = `<!DOCTYPE worksheet>${SHEET(HEADER_ROW)}`
    await expect(readXlsx(await xlsx('', { 'xl/worksheets/sheet1.xml': sheet }))).resolves.toEqual({
      ok: false,
      problem: 'malformed',
    })
  })

  it('reports a character reference outside Unicode as malformed', async () => {
    const rows = '<row r="1"><c r="A1" t="inlineStr"><is><t>&#x110000;</t></is></c></row>'
    await expect(readXlsx(await xlsx(rows))).resolves.toEqual({ ok: false, problem: 'malformed' })
  })

  it('reports a broken zip as malformed', async () => {
    await expect(readXlsx(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).resolves.toEqual({
      ok: false,
      problem: 'malformed',
    })
  })

  it('reports an entry that fails to inflate as malformed', async () => {
    const bytes = await xlsx(HEADER_ROW)
    // Corrupt the uncompressed size in the central-directory record of the workbook part: JSZip then emits an
    // error while streaming it.
    const name = utf8('xl/workbook.xml')
    const record = bytes.findIndex(
      (_, index) =>
        [0x50, 0x4b, 0x01, 0x02].every((byte, offset) => bytes[index + offset] === byte) &&
        name.every((byte, offset) => bytes[index + 46 + offset] === byte),
    )
    expect(record).toBeGreaterThan(0)
    bytes[record + 24] ^= 0x01
    await expect(readXlsx(bytes)).resolves.toEqual({ ok: false, problem: 'malformed' })
  })

  it('refuses a zip with too many entries', async () => {
    const extra: Parts = {}
    for (let index = 0; index < IMPORT_MAX_ZIP_ENTRIES; index++) extra[`xl/media/f${String(index)}.txt`] = 'x'
    await expect(readXlsx(await xlsx(HEADER_ROW, extra))).resolves.toEqual({ ok: false, problem: 'too_large' })
  })

  it('stops inflating once the parts read together exceed the uncompressed limit', async () => {
    const half = Math.ceil(IMPORT_MAX_UNCOMPRESSED_BYTES / 2)
    const parts = { 'xl/sharedStrings.xml': SHARED(' '.repeat(half)) }
    const rows = `${HEADER_ROW}${' '.repeat(half)}`
    await expect(readXlsx(await xlsx(rows, parts))).resolves.toEqual({ ok: false, problem: 'too_large' })
  })
})
