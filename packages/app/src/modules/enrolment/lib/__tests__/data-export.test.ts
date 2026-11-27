import { describe, expect, it } from '@jest/globals'
import { ENROLMENT_APPLICATIONS_ACTIVITY, applicationExportRow, type ApplicationExportSource } from '../data-export'

const at = (value: string) => new Date(value)

const child: ApplicationExportSource = {
  id: 'app-1',
  kind: 'child',
  state: 'accepted',
  sectionName: 'Football',
  participantFirstName: 'Ola',
  participantLastName: 'Nowak',
  participantBirthDate: '2017-03-14',
  guardianFirstName: 'Anna',
  guardianLastName: 'Nowak',
  email: 'anna@example.test',
  phone: '+48600100200',
  wantsTrial: true,
  experience: null,
  rulesAcceptedAt: at('2026-11-01T10:00:00Z'),
  privacyAcknowledgedAt: at('2026-11-01T10:00:00Z'),
  createdAt: at('2026-11-01T10:00:00Z'),
  confirmedAt: at('2026-11-01T10:05:00Z'),
  decidedAt: at('2026-11-03T10:00:00Z'),
  closedAt: at('2026-11-03T10:00:00Z'),
  acceptedChildPersonId: 'ola',
  acceptedGuardianPersonId: 'anna',
}

describe('the enrolment part of the data export (REQ-J18, DD-X03)', () => {
  it('shows the guardian their own contact and the child by name only', () => {
    const row = applicationExportRow(child, 'anna')
    expect(ENROLMENT_APPLICATIONS_ACTIVITY).toBe('A17')
    expect(row.role).toBe('guardian')
    expect(row.participant).toEqual({ relation: 'ward', name: 'Ola Nowak' })
    expect(row.contact).toEqual({
      firstName: 'Anna',
      lastName: 'Nowak',
      email: 'anna@example.test',
      phone: '+48600100200',
    })
    expect(row.guardian).toBeNull()
    expect(row.closedAt).toBe('2026-11-03T10:00:00.000Z')
  })

  it('shows the child its own data and the guardian by name, without the contact', () => {
    const row = applicationExportRow(child, 'ola')
    expect(row.role).toBe('participant')
    expect(row.participant).toEqual({ firstName: 'Ola', lastName: 'Nowak', birthDate: '2017-03-14' })
    expect(row.contact).toBeNull()
    expect(row.guardian).toEqual({ relation: 'guardian', name: 'Anna Nowak' })
  })

  it('shows an adult their own data and contact; a missing name and dates stay empty', () => {
    const row = applicationExportRow(
      {
        ...child,
        kind: 'adult',
        guardianFirstName: null,
        guardianLastName: null,
        confirmedAt: null,
        decidedAt: null,
        closedAt: null,
        acceptedChildPersonId: 'adam',
        acceptedGuardianPersonId: null,
      },
      'adam',
    )
    expect(row.contact).toEqual({
      firstName: 'Ola',
      lastName: 'Nowak',
      email: 'anna@example.test',
      phone: '+48600100200',
    })
    expect(row.guardian).toBeNull()
    expect(row.confirmedAt).toBeNull()
    const nameless = applicationExportRow({ ...child, guardianFirstName: null, guardianLastName: null }, 'ola')
    expect(nameless.guardian).toEqual({ relation: 'guardian' })
  })
})
