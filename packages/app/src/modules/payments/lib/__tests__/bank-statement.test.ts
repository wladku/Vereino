import { describe, expect, it } from '@jest/globals'
import {
  MAX_STATEMENT_BYTES,
  MAX_STATEMENT_ENTRIES,
  decodeStatement,
  detectStatementFormat,
  foldText,
  mt940Details,
  parseAmount,
  parseCsvStatement,
  parseMt940Statement,
  parseStatement,
  parseStatementDate,
  readCsvRecords,
  resolveColumns,
} from '../bank-statement'

const bytes = (text: string) => new TextEncoder().encode(text)

describe('decodeStatement', () => {
  it('reads UTF-8 and drops a byte-order mark', () => {
    expect(decodeStatement(bytes('﻿Data;Kwota'))).toBe('Data;Kwota')
    expect(decodeStatement(bytes('Łódź'))).toBe('Łódź')
  })

  it('falls back to Windows-1250 for bytes that are not UTF-8', () => {
    // "Łódź" in Windows-1250.
    expect(decodeStatement(new Uint8Array([0xa3, 0xf3, 0x64, 0x9f]))).toBe('Łódź')
  })

  it('refuses binary content', () => {
    expect(decodeStatement(new Uint8Array([0x25, 0x00, 0x50]))).toBeNull()
  })
})

describe('detectStatementFormat', () => {
  it('tells MT940 from CSV', () => {
    expect(detectStatementFormat(':20:STMT\n:25:PL123\n:61:2611031103C150,00NTRF')).toBe('mt940')
    expect(detectStatementFormat('Data;Kwota\n2026-11-03;150')).toBe('csv')
    expect(detectStatementFormat(':20:only a reference')).toBe('csv')
  })
})

describe('foldText', () => {
  it('folds case, diacritics and punctuation', () => {
    expect(foldText('  Tytuł  OPERACJI / Żółć ')).toBe('tytul operacji zolc')
    expect(foldText('ŁUKASZ')).toBe('lukasz')
  })
})

describe('parseAmount', () => {
  it.each([
    ['150', 15000],
    ['150,5', 15050],
    ['150.05', 15005],
    ['1 234,56', 123456],
    ['1 234,56', 123456],
    ['1.234,56', 123456],
    ['1,234.56', 123456],
    ['1,234', 123400],
    ['1.234.567', 123456700],
    ['-150,00', -15000],
    ['+80 PLN', 8000],
    ['80,00 zł', 8000],
    ['80 zl', 8000],
    ['150,00-', -15000],
    ['150,', 15000],
  ])('reads %s', (raw, grosz) => {
    expect(parseAmount(raw)).toBe(grosz)
  })

  it.each(['', 'abc', ',50', '12,34,5', '1,2345', '1.23.4', '--5'])('refuses %s', (raw) => {
    expect(parseAmount(raw)).toBeNull()
  })
})

describe('parseStatementDate', () => {
  it.each([
    ['2026-11-03', '2026-11-03'],
    ['2026-11-03 12:30', '2026-11-03'],
    ['03.11.2026', '2026-11-03'],
    ['03-11-2026', '2026-11-03'],
    ['03/11/2026', '2026-11-03'],
    ['20261103', '2026-11-03'],
    [' 03.11.2026 ', '2026-11-03'],
  ])('reads %s', (raw, date) => {
    expect(parseStatementDate(raw)).toBe(date)
  })

  it.each(['', 'Saldo', '2026-02-30', '31.02.2026', '2026/11/03'])('refuses %s', (raw) => {
    expect(parseStatementDate(raw)).toBeNull()
  })
})

describe('readCsvRecords', () => {
  it('detects the delimiter and reads quoted fields', () => {
    expect(readCsvRecords('a;b;"c;d"\r\n1;"x ""y""";3\n')).toEqual([
      { line: 1, cells: ['a', 'b', 'c;d'] },
      { line: 2, cells: ['1', 'x "y"', '3'] },
    ])
    expect(readCsvRecords('a,b\n1,2')).toEqual([
      { line: 1, cells: ['a', 'b'] },
      { line: 2, cells: ['1', '2'] },
    ])
    expect(readCsvRecords('a\tb\n1\t2')?.[1].cells).toEqual(['1', '2'])
  })

  it('keeps line numbers across quoted line breaks and skips blank lines', () => {
    expect(readCsvRecords('\n\na;b\r"multi\nline";2\n;\n3;4')).toEqual([
      { line: 3, cells: ['a', 'b'] },
      { line: 4, cells: ['multi\nline', '2'] },
      { line: 7, cells: ['3', '4'] },
    ])
  })

  it('takes the semicolon on a tie and ignores delimiters inside quotes', () => {
    expect(readCsvRecords('"a,b";c,d;e')?.[0].cells).toEqual(['a,b', 'c,d', 'e'])
  })

  it('reads a last field that ends with a delimiter', () => {
    expect(readCsvRecords('a;b\n1;')).toEqual([
      { line: 1, cells: ['a', 'b'] },
      { line: 2, cells: ['1', ''] },
    ])
  })

  it('refuses an unclosed quote', () => {
    expect(readCsvRecords('a;"b\n1;2')).toBeNull()
  })
})

describe('resolveColumns', () => {
  it('finds the columns by their known names', () => {
    expect(resolveColumns(['Data operacji', 'Kwota', 'Nadawca', 'Tytuł', 'Numer rachunku'])).toEqual({
      date: 0,
      amount: 1,
      sender: 2,
      title: 3,
      account: 4,
    })
  })

  it('uses the mapping when given and never takes one column twice', () => {
    expect(resolveColumns(['Booked', 'Sum', 'Who', 'What'], { date: 'booked', amount: 'SUM', title: 'What' })).toEqual({
      date: 0,
      amount: 1,
      sender: -1,
      title: 3,
      account: -1,
    })
    expect(resolveColumns(['Data', 'Data'])).toMatchObject({ date: 0, amount: -1 })
  })
})

describe('parseCsvStatement', () => {
  const csv = [
    'Rachunek: 12 3456;;;',
    'Data;Kwota;Nadawca;Tytuł;Rachunek',
    '2026-11-03;150,00;Anna Lis;GW-7K2M składka;PL61109010140000071219812874',
    '04.11.2026;-20,00;Sklep;Zakup;',
    'Saldo końcowe;1 000,00;;;',
    '05.11.2026;abc;X;Y;',
  ].join('\n')

  it('skips the preamble, reads the entries and reports unreadable lines', () => {
    const result = parseCsvStatement(csv)
    expect(result).toEqual({
      ok: true,
      format: 'csv',
      entries: [
        {
          line: 3,
          bookedOn: '2026-11-03',
          amount: 15000,
          counterpartyName: 'Anna Lis',
          counterpartyAccount: 'PL61109010140000071219812874',
          title: 'GW-7K2M składka',
        },
        {
          line: 4,
          bookedOn: '2026-11-04',
          amount: -2000,
          counterpartyName: 'Sklep',
          counterpartyAccount: '',
          title: 'Zakup',
        },
      ],
      unreadable: [5, 6],
      columnProfile: { date: 'Data', amount: 'Kwota', sender: 'Nadawca', title: 'Tytuł', account: 'Rachunek' },
    })
  })

  it('reads the optional columns as empty when absent and short rows as empty cells', () => {
    const result = parseCsvStatement('date,amount,title\n2026-11-03,10,"a\tb  c"\n2026-11-04,5')
    expect(result.ok && result.entries).toEqual([
      { line: 2, bookedOn: '2026-11-03', amount: 1000, counterpartyName: '', counterpartyAccount: '', title: 'a b c' },
      { line: 3, bookedOn: '2026-11-04', amount: 500, counterpartyName: '', counterpartyAccount: '', title: '' },
    ])
  })

  it('names the required columns a file lacks', () => {
    expect(parseCsvStatement('Data;Nadawca;Tytuł\n2026-11-03;A;B')).toEqual({
      ok: false,
      problem: 'columns_missing',
      missing: ['amount'],
    })
    expect(parseCsvStatement('x;y\nData;Tytuł\n1;2')).toEqual({
      ok: false,
      problem: 'columns_missing',
      missing: ['amount'],
    })
    expect(parseCsvStatement('Kwota\n1')).toEqual({ ok: false, problem: 'columns_missing', missing: ['date', 'title'] })
  })

  it('applies the mapping', () => {
    const result = parseCsvStatement('Booked;Sum;What\n2026-11-03;10;x', {
      date: 'Booked',
      amount: 'Sum',
      title: 'What',
    })
    expect(result.ok && result.columnProfile).toEqual({ date: 'Booked', amount: 'Sum', title: 'What' })
  })

  it('refuses malformed and empty text', () => {
    expect(parseCsvStatement('a;"b')).toEqual({ ok: false, problem: 'format_unsupported' })
    expect(parseCsvStatement('\n;;\n')).toEqual({ ok: false, problem: 'empty' })
  })
})

describe('mt940Details', () => {
  it('reads the Polish structured subfields', () => {
    expect(
      mt940Details('020~00VE02~20GW-7K2M skła~21dka listopad~32ANNA LIS~33 UL. POLNA~38PL61109010140000071219812874'),
    ).toEqual({ title: 'GW-7K2M składka listopad', name: 'ANNA LIS UL. POLNA', account: '61109010140000071219812874' })
    expect(mt940Details('<20Tytul<32Nadawca')).toEqual({ title: 'Tytul', name: 'Nadawca', account: '' })
    expect(mt940Details('?20Title?30x')).toEqual({ title: 'Title', name: '', account: '' })
  })

  it('takes unstructured details as the title', () => {
    expect(mt940Details('Składka\nlistopad')).toEqual({ title: 'Składka listopad', name: '', account: '' })
  })
})

describe('parseMt940Statement', () => {
  const mt940 = [
    '{1:F01}',
    ':20:STMT',
    ':25:PL61109010140000071219812874',
    ':60F:C261031PLN1000,00',
    ':61:2611031103C150,00NTRFNONREF',
    ':86:020~20GW-7K2M składka~32ANNA LIS',
    ':61:261104D20,NTRF',
    ':86:Zakup',
    ':61:261105RC5,00NTRF',
    ':61:261106RD7,5NTRF',
    ':86:Zwrot',
    'z bankiem',
    ':61:BROKEN',
    ':62F:C261106PLN1130,00',
    '-',
    '-}',
  ].join('\r\n')

  it('reads every statement line with its details', () => {
    expect(parseMt940Statement(mt940)).toEqual({
      ok: true,
      format: 'mt940',
      entries: [
        {
          line: 5,
          bookedOn: '2026-11-03',
          amount: 15000,
          counterpartyName: 'ANNA LIS',
          counterpartyAccount: '',
          title: 'GW-7K2M składka',
        },
        {
          line: 7,
          bookedOn: '2026-11-04',
          amount: -2000,
          counterpartyName: '',
          counterpartyAccount: '',
          title: 'Zakup',
        },
        { line: 9, bookedOn: '2026-11-05', amount: -500, counterpartyName: '', counterpartyAccount: '', title: '' },
        {
          line: 10,
          bookedOn: '2026-11-06',
          amount: 750,
          counterpartyName: '',
          counterpartyAccount: '',
          title: 'Zwrot z bankiem',
        },
      ],
      unreadable: [13],
      columnProfile: null,
    })
  })

  it('reports an impossible date as unreadable', () => {
    expect(parseMt940Statement(':20:X\n:61:261302C1,00NTRF')).toMatchObject({ entries: [], unreadable: [2] })
  })
})

describe('parseStatement', () => {
  it('detects the format from the content', () => {
    expect(parseStatement(bytes('Data;Kwota;Tytuł\n2026-11-03;10;x'))).toMatchObject({ ok: true, format: 'csv' })
    expect(parseStatement(bytes(':20:X\n:61:261103C1,00NTRF'))).toMatchObject({ ok: true, format: 'mt940' })
  })

  it('takes the given format and mapping', () => {
    expect(parseStatement(bytes(':20:X\n:61:261103C1,00NTRF'), { format: 'csv' })).toMatchObject({
      ok: false,
      problem: 'columns_missing',
    })
    expect(
      parseStatement(bytes('D;A;T\n2026-11-03;10;x'), { columnProfile: { date: 'D', amount: 'A', title: 'T' } }),
    ).toMatchObject({ ok: true })
  })

  it('refuses empty, oversized, binary, unreadable and too long files', () => {
    expect(parseStatement(new Uint8Array())).toEqual({ ok: false, problem: 'empty' })
    expect(parseStatement(bytes('  \n '))).toEqual({ ok: false, problem: 'empty' })
    expect(parseStatement(new Uint8Array(MAX_STATEMENT_BYTES + 1).fill(65))).toEqual({
      ok: false,
      problem: 'too_large',
    })
    expect(parseStatement(new Uint8Array([1, 0, 2]))).toEqual({ ok: false, problem: 'format_unsupported' })
    expect(parseStatement(bytes('Data;Kwota;Tytuł\nSaldo;x;y'))).toEqual({ ok: false, problem: 'nothing_readable' })
    const rows = Array.from({ length: MAX_STATEMENT_ENTRIES + 1 }, (_, index) => `2026-11-03;${String(index + 1)};t`)
    expect(parseStatement(bytes(['Data;Kwota;Tytuł', ...rows].join('\n')))).toEqual({
      ok: false,
      problem: 'too_many_entries',
    })
  })
})
