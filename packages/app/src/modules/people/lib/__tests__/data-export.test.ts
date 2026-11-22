import { describe, expect, it } from '@jest/globals'
import {
  ATTACHMENT_BINARY_CATEGORY,
  DATA_EXPORT_FORMAT,
  DATA_EXPORT_VERSION,
  PESEL_WITHHELD,
  SECURITY_AUDIT_CATEGORIES,
  assembleDataExport,
  dataExportFileName,
  isSecretKey,
  omittedParts,
  redactConsents,
  redactPerson,
  reviewRequiredOf,
  withoutSecrets,
  type DataExportSection,
} from '../data-export'

describe('redactPerson', () => {
  it('keeps the name only for a named relation', () => {
    expect(redactPerson('guardian', ' Anna Nowak ')).toEqual({ relation: 'guardian', name: 'Anna Nowak' })
    expect(redactPerson('coach', 'Jan Kowalski')).toEqual({ relation: 'coach', name: 'Jan Kowalski' })
    expect(redactPerson('staff', 'Jan Kowalski')).toEqual({ relation: 'staff' })
  })

  it('gives the relation alone without a name', () => {
    expect(redactPerson('ward')).toEqual({ relation: 'ward' })
    expect(redactPerson('ward', null)).toEqual({ relation: 'ward' })
    expect(redactPerson('ward', '  ')).toEqual({ relation: 'ward' })
  })
})

describe('redactConsents', () => {
  it('replaces the author id with subject or other', () => {
    expect(
      redactConsents(
        {
          regulations: { granted: true, at: '2026-01-01T00:00:00Z', byPersonId: 'me' },
          image: { granted: false, at: '2026-02-01T00:00:00Z', byPersonId: 'guardian-1' },
          trips: { granted: false, at: null, byPersonId: null },
        },
        'me',
      ),
    ).toEqual({
      regulations: { granted: true, at: '2026-01-01T00:00:00Z', by: 'subject' },
      image: { granted: false, at: '2026-02-01T00:00:00Z', by: 'other' },
      trips: { granted: false, at: null, by: null },
    })
  })
})

describe('omittedParts', () => {
  it('lists modules not enabled or without a contributor, then the fixed categories', () => {
    const omitted = omittedParts([
      { module: 'groups', enabled: true, registered: true },
      { module: 'facilities', enabled: false, registered: false },
      { module: 'club_core', enabled: true, registered: false },
    ])
    expect(omitted).toEqual([
      { module: 'facilities', reason: 'module_not_enabled' },
      { module: 'club_core', reason: 'no_contributor' },
      ...SECURITY_AUDIT_CATEGORIES.map((category) => ({ category, reason: 'security_audit_not_subject_data' })),
      { category: ATTACHMENT_BINARY_CATEGORY, reason: 'attachment_binary' },
    ])
  })
})

describe('reviewRequiredOf', () => {
  it('lists every review field holding a value, per row', () => {
    const sections: DataExportSection[] = [
      {
        module: 'facilities',
        table: 'facilities_incidents',
        activity: 'A9',
        portable: false,
        reviewFields: ['involved', 'description'],
        rows: [
          { id: 'i1', involved: 'Two boys', description: '' },
          { id: 'i2', involved: null, description: { text: 'x' } },
          { id: 'i3', involved: [], description: {} },
          { id: 'i4', involved: ['a'], description: 0 },
          { involved: 'no id' },
        ],
      },
      { module: 'groups', table: 'groups_memberships', activity: 'A3', portable: true, rows: [{ id: 'm1' }] },
    ]
    expect(reviewRequiredOf(sections)).toEqual([
      { module: 'facilities', table: 'facilities_incidents', recordId: 'i1', field: 'involved' },
      { module: 'facilities', table: 'facilities_incidents', recordId: 'i4', field: 'involved' },
      { module: 'facilities', table: 'facilities_incidents', recordId: '', field: 'involved' },
      { module: 'facilities', table: 'facilities_incidents', recordId: 'i2', field: 'description' },
      { module: 'facilities', table: 'facilities_incidents', recordId: 'i4', field: 'description' },
    ])
  })
})

describe('withoutSecrets', () => {
  it('names the secret keys', () => {
    expect(isSecretKey('peselHash')).toBe(true)
    expect(isSecretKey('token_hash')).toBe(true)
    expect(isSecretKey('secretParams')).toBe(true)
    expect(isSecretKey('params')).toBe(true)
    expect(isSecretKey('pesel')).toBe(false)
  })

  it('drops secret keys at any depth and writes dates as ISO text', () => {
    const at = new Date('2026-11-21T10:00:00Z')
    expect(
      withoutSecrets({
        a: 1,
        emailHash: 'h',
        nested: { tokenHash: 't', keep: [{ secret_params: 's', at }] },
        list: ['x', null],
      }),
    ).toEqual({ a: 1, nested: { keep: [{ at: '2026-11-21T10:00:00.000Z' }] }, list: ['x', null] })
    expect(withoutSecrets('plain')).toBe('plain')
  })
})

describe('assembleDataExport', () => {
  it('builds the version 1 document', () => {
    const document = assembleDataExport({
      generatedAt: new Date('2026-11-21T10:00:00Z'),
      subject: { id: 'p1', firstName: 'Ola', peselHash: 'x' },
      parts: [
        {
          sections: [
            {
              module: 'people',
              table: 'people_import_rows',
              activity: 'A1',
              portable: false,
              reviewFields: ['raw'],
              rows: [{ id: 'r1', raw: { name: 'Ola' }, externalIdHash: 'h' }],
            },
          ],
          actorCounts: [
            { module: 'people', table: 'people_imports', count: 0 },
            { module: 'people', table: 'people_departure_requests', count: 2 },
          ],
        },
      ],
      omitted: [{ module: 'facilities', reason: 'module_not_enabled' }],
    })
    expect(document).toEqual({
      format: DATA_EXPORT_FORMAT,
      version: DATA_EXPORT_VERSION,
      generatedAt: '2026-11-21T10:00:00.000Z',
      subject: { id: 'p1', firstName: 'Ola' },
      sections: [
        {
          module: 'people',
          table: 'people_import_rows',
          activity: 'A1',
          portable: false,
          reviewFields: ['raw'],
          rows: [{ id: 'r1', raw: { name: 'Ola' } }],
        },
      ],
      actorCounts: [{ module: 'people', table: 'people_departure_requests', count: 2 }],
      reviewRequired: [{ module: 'people', table: 'people_import_rows', recordId: 'r1', field: 'raw' }],
      omitted: [{ module: 'facilities', reason: 'module_not_enabled' }],
    })
  })
})

describe('PESEL_WITHHELD', () => {
  it('names the feature that reads the PESEL', () => {
    expect(PESEL_WITHHELD).toBe('[withheld: people.pesel.view]')
  })
})

describe('dataExportFileName', () => {
  it('carries the date only', () => {
    expect(dataExportFileName(new Date('2026-11-21T23:30:00Z'))).toBe('person-data-2026-11-21.json')
  })
})
