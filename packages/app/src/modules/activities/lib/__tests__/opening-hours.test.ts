import { describe, expect, it } from '@jest/globals'
import type { OpeningHours } from '@vereino/core'
import { eventOutsideOpeningHours, openingLine } from '../opening-hours'

// #288 (facilities parity spec REQ-R19, DD-R15, TEST-R19): a one-off event on a club place inside the day's opening
// windows. 2027-05-04 is a Tuesday (ISO weekday 2); Warsaw is UTC+2 then.
const ZONE = 'Europe/Warsaw'
const at = (local: string): Date => new Date(`2027-05-04T${local}:00+02:00`)

const pitch: OpeningHours = {
  seasons: [
    {
      from: '04-01',
      to: '10-31',
      windows: [
        { weekday: 2, from: '14:00', to: '22:00' },
        { weekday: 2, from: '08:00', to: '12:00' },
        { weekday: 3, from: '06:00', to: '24:00' },
      ],
    },
  ],
}

describe('eventOutsideOpeningHours', () => {
  it('has no limit without opening hours', () => {
    expect(eventOutsideOpeningHours(null, at('06:00'), at('08:00'), ZONE)).toBeNull()
  })

  it('accepts an event inside one window, edges included', () => {
    expect(eventOutsideOpeningHours(pitch, at('09:00'), at('11:00'), ZONE)).toBeNull()
    expect(eventOutsideOpeningHours(pitch, at('08:00'), at('12:00'), ZONE)).toBeNull()
    expect(eventOutsideOpeningHours(pitch, at('20:00'), at('22:00'), ZONE)).toBeNull()
  })

  it('refuses an event that starts before opening and lists the day windows by start', () => {
    expect(eventOutsideOpeningHours(pitch, at('07:00'), at('09:00'), ZONE)).toEqual([
      { from: '08:00', to: '12:00' },
      { from: '14:00', to: '22:00' },
    ])
  })

  it('refuses an event that spans the break between two windows or ends after closing', () => {
    expect(eventOutsideOpeningHours(pitch, at('11:00'), at('15:00'), ZONE)).not.toBeNull()
    expect(eventOutsideOpeningHours(pitch, at('21:00'), at('23:00'), ZONE)).not.toBeNull()
  })

  it('accepts an event ending at midnight in a window that closes at 24:00, refuses one past midnight', () => {
    const wednesday = (local: string, day = '05'): Date => new Date(`2027-05-${day}T${local}:00+02:00`)
    expect(eventOutsideOpeningHours(pitch, wednesday('22:00'), wednesday('00:00', '06'), ZONE)).toBeNull()
    expect(eventOutsideOpeningHours(pitch, wednesday('23:00'), wednesday('01:00', '06'), ZONE)).toEqual([
      { from: '06:00', to: '24:00' },
    ])
  })

  it('refuses every event on a date no season covers, or a weekday without windows', () => {
    const winter = new Date('2027-01-05T10:00:00+01:00')
    expect(eventOutsideOpeningHours(pitch, winter, new Date(winter.getTime() + 3_600_000), ZONE)).toEqual([])
    const thursday = new Date('2027-05-06T10:00:00+02:00')
    expect(eventOutsideOpeningHours(pitch, thursday, new Date(thursday.getTime() + 3_600_000), ZONE)).toEqual([])
  })
})

describe('openingLine', () => {
  it('joins the windows, or shows a dash for a closed day', () => {
    expect(
      openingLine([
        { from: '08:00', to: '12:00' },
        { from: '14:00', to: '22:00' },
      ]),
    ).toBe('08:00–12:00, 14:00–22:00')
    expect(openingLine([])).toBe('—')
  })
})
