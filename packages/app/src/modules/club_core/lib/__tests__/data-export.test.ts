import { describe, expect, it } from '@jest/globals'
import {
  CLUB_CORE_CONTRACTS_ACTIVITY,
  CLUB_CORE_CONTRACTS_TABLE,
  CLUB_CORE_EXPORT_MODULE,
  contractExportRow,
} from '../data-export'

const ROW = {
  id: 'contract-1',
  kind: 'coach',
  validFrom: '2026-09-01',
  validTo: '2027-06-30',
  terms: JSON.stringify({ baseMonthly: 150_000, unknown: 'dropped' }),
  attachmentId: 'attachment-1',
  createdAt: new Date('2026-08-20T10:00:00.000Z'),
  updatedAt: new Date('2026-08-21T10:00:00.000Z'),
}

describe('club_core data export', () => {
  it('names the section after its table and RoPA activity', () => {
    expect([CLUB_CORE_EXPORT_MODULE, CLUB_CORE_CONTRACTS_TABLE, CLUB_CORE_CONTRACTS_ACTIVITY]).toEqual([
      'club_core',
      'club_core_contracts',
      'A11',
    ])
  })

  it('shows a coach contract with its decrypted rates and the attachment as metadata only', () => {
    const row = contractExportRow(ROW)
    expect(row).toEqual({
      id: 'contract-1',
      kind: 'coach',
      validFrom: '2026-09-01',
      validTo: '2027-06-30',
      terms: { baseMonthly: 150_000 },
      attachment: { attachmentId: 'attachment-1' },
      createdAt: '2026-08-20T10:00:00.000Z',
      updatedAt: '2026-08-21T10:00:00.000Z',
    })
  })

  it('reads the terms of a management agreement', () => {
    const row = contractExportRow({
      ...ROW,
      kind: 'facility_management',
      terms: JSON.stringify({ paymentDeadlineDays: 5, autoExpireUnpaid: true }),
    })
    expect(row.terms).toEqual({ paymentDeadlineDays: 5, autoExpireUnpaid: true })
  })

  it('keeps missing terms, end, attachment and timestamps as null', () => {
    expect(contractExportRow({ id: 'c', kind: 'other', validFrom: '2026-09-01' })).toEqual({
      id: 'c',
      kind: 'other',
      validFrom: '2026-09-01',
      validTo: null,
      terms: null,
      attachment: null,
      createdAt: null,
      updatedAt: null,
    })
  })

  it('carries no party id and no hash or token key', () => {
    const keys = Object.keys(contractExportRow({ ...ROW, partyId: 'person-1' } as typeof ROW))
    expect(keys).not.toContain('partyId')
    expect(keys.filter((key) => /hash$|token|params/i.test(key))).toEqual([])
  })
})
