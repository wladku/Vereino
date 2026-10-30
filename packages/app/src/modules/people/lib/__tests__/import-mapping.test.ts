import { describe, expect, it } from '@jest/globals'
import { IMPORT_FIELDS, checkMapping, normalizeHeader, slotField, suggestMapping } from '../import-mapping'

describe('normalizeHeader', () => {
  it('lower-cases, drops Polish diacritics and collapses punctuation', () => {
    expect(normalizeHeader('  Imię  DZIECKA ')).toBe('imie dziecka')
    expect(normalizeHeader('Nr. telefonu (rodzica)')).toBe('nr telefonu rodzica')
    expect(normalizeHeader('E-mail')).toBe('e mail')
    expect(normalizeHeader('Łódź-Żółć')).toBe('lodz zolc')
  })
})

describe('IMPORT_FIELDS', () => {
  it('lists every field of the participant and both guardians, then the group', () => {
    expect(IMPORT_FIELDS).toHaveLength(22)
    expect(IMPORT_FIELDS[0]).toBe('participant.firstName')
    expect(IMPORT_FIELDS.at(-1)).toBe('group')
    expect(slotField('guardian2', 'phone')).toBe('guardian2.phone')
  })
})

describe('suggestMapping', () => {
  it('reads a Polish family sheet', () => {
    const header = [
      'Imię dziecka',
      'Nazwisko dziecka',
      'Data urodzenia',
      'PESEL',
      'Imię rodzica',
      'Nazwisko rodzica',
      'E-mail',
      'Telefon',
      'Grupa',
      'Uwagi',
    ]
    expect(suggestMapping(header)).toEqual({
      'participant.firstName': 0,
      'participant.lastName': 1,
      'participant.birthDate': 2,
      'participant.pesel': 3,
      'guardian1.firstName': 4,
      'guardian1.lastName': 5,
      'guardian1.email': 6,
      'guardian1.phone': 7,
      group: 8,
    })
  })

  it('reads an English sheet with two numbered guardians and keeps contacts of a sheet without guardians', () => {
    expect(
      suggestMapping([
        'First name',
        'Last name',
        'Date of birth',
        'Member ID',
        'Guardian 1 first name',
        'Guardian 1 last name',
        'Guardian 1 email',
        'Guardian 2 first name',
        'Guardian 2 last name',
        'Parent 2 phone',
        'Team',
      ]),
    ).toEqual({
      'participant.firstName': 0,
      'participant.lastName': 1,
      'participant.birthDate': 2,
      'participant.externalId': 3,
      'guardian1.firstName': 4,
      'guardian1.lastName': 5,
      'guardian1.email': 6,
      'guardian2.firstName': 7,
      'guardian2.lastName': 8,
      'guardian2.phone': 9,
      group: 10,
    })
    expect(suggestMapping(['Name', 'Surname', 'Email', 'Phone'])).toEqual({
      'participant.firstName': 0,
      'participant.lastName': 1,
      'participant.email': 2,
      'participant.phone': 3,
    })
  })

  it('keeps a qualified participant contact and does not override a mapped guardian contact', () => {
    expect(
      suggestMapping([
        'Imię',
        'Nazwisko',
        'E-mail dziecka',
        'Imię rodzica',
        'Nazwisko rodzica',
        'Telefon rodzica',
        'Tel',
      ]),
    ).toEqual({
      'participant.firstName': 0,
      'participant.lastName': 1,
      'participant.email': 2,
      'participant.phone': 6,
      'guardian1.firstName': 3,
      'guardian1.lastName': 4,
      'guardian1.phone': 5,
    })
  })

  it('uses each column once and ignores unknown headers', () => {
    expect(suggestMapping(['Nazwisko', 'Nazwisko', 'Coś innego'])).toEqual({ 'participant.lastName': 0 })
    expect(suggestMapping([])).toEqual({})
  })
})

describe('checkMapping', () => {
  const names = { 'participant.firstName': 0, 'participant.lastName': 1 }

  it('accepts the participant names with optional fields', () => {
    expect(checkMapping(names, 2)).toEqual({ ok: true })
    expect(checkMapping({ ...names, 'guardian1.firstName': 2, 'guardian1.lastName': 3, group: 4 }, 5)).toEqual({
      ok: true,
    })
  })

  it('refuses columns outside the header and a column used twice', () => {
    expect(checkMapping({ ...names, group: 2 }, 2)).toEqual({
      ok: false,
      problem: 'column_out_of_range',
      field: 'group',
    })
    expect(checkMapping({ ...names, group: -1 }, 3)).toEqual({
      ok: false,
      problem: 'column_out_of_range',
      field: 'group',
    })
    expect(checkMapping({ ...names, group: 1.5 }, 3)).toEqual({
      ok: false,
      problem: 'column_out_of_range',
      field: 'group',
    })
    expect(checkMapping({ ...names, group: 1 }, 3)).toEqual({ ok: false, problem: 'column_reused', field: 'group' })
  })

  it('needs both participant names and both names of a mapped guardian', () => {
    expect(checkMapping({ 'participant.firstName': 0 }, 2)).toEqual({
      ok: false,
      problem: 'participant_name_required',
      field: 'participant.lastName',
    })
    expect(checkMapping({ ...names, 'guardian2.email': 2 }, 3)).toEqual({
      ok: false,
      problem: 'guardian_name_required',
      field: 'guardian2.firstName',
    })
    expect(checkMapping({ ...names, 'guardian1.firstName': 2 }, 3)).toEqual({
      ok: false,
      problem: 'guardian_name_required',
      field: 'guardian1.lastName',
    })
  })
})
