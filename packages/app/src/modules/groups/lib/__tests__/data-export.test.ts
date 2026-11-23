import { describe, expect, it } from '@jest/globals'
import {
  GROUPS_EXPORT_MODULE,
  GROUPS_MEMBERSHIPS_ACTIVITY,
  GROUPS_MEMBERSHIPS_TABLE,
  membershipExportRow,
} from '../data-export'

const ROW = {
  id: 'membership-1',
  groupId: 'group-1',
  role: 'participant',
  validFrom: '2026-09-01',
  validTo: null,
  createdAt: new Date('2026-08-20T10:00:00.000Z'),
  updatedAt: new Date('2026-08-21T10:00:00.000Z'),
}

describe('groups data export', () => {
  it('names the section after its table and RoPA activity', () => {
    expect([GROUPS_EXPORT_MODULE, GROUPS_MEMBERSHIPS_TABLE, GROUPS_MEMBERSHIPS_ACTIVITY]).toEqual([
      'groups',
      'groups_memberships',
      'A3',
    ])
  })

  it('shows a membership with its group, period, status and dates', () => {
    expect(membershipExportRow(ROW, 'Żaki', '2026-11-22')).toEqual({
      id: 'membership-1',
      role: 'participant',
      group: { id: 'group-1', name: 'Żaki' },
      validFrom: '2026-09-01',
      validTo: null,
      status: 'active',
      createdAt: '2026-08-20T10:00:00.000Z',
      updatedAt: '2026-08-21T10:00:00.000Z',
    })
  })

  it('gives the status on the club day: ended and upcoming', () => {
    expect(membershipExportRow({ ...ROW, validTo: '2026-10-31' }, 'Żaki', '2026-11-22')).toMatchObject({
      validTo: '2026-10-31',
      status: 'ended',
    })
    expect(membershipExportRow({ ...ROW, validFrom: '2026-12-01' }, 'Żaki', '2026-11-22').status).toBe('upcoming')
  })

  it('keeps a missing group name, end and timestamps as null', () => {
    const row = membershipExportRow(
      { id: 'm', groupId: 'g', role: 'coach', validFrom: '2026-09-01' },
      undefined,
      '2026-11-22',
    )
    expect(row).toEqual({
      id: 'm',
      role: 'coach',
      group: { id: 'g', name: null },
      validFrom: '2026-09-01',
      validTo: null,
      status: 'active',
      createdAt: null,
      updatedAt: null,
    })
  })

  it('carries no person id and no hash or token key', () => {
    const keys = Object.keys(membershipExportRow({ ...ROW, personId: 'person-1' } as typeof ROW, 'Żaki', '2026-11-22'))
    expect(keys).not.toContain('personId')
    expect(keys.filter((key) => /hash$|token|params/i.test(key))).toEqual([])
  })
})
