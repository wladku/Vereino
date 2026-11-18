import { describe, expect, it } from '@jest/globals'
import {
  SECTION_COUNT_VIEWS,
  SECTION_LIST_PAGE_SIZE,
  SECTION_VIEWS,
  sectionCalendarHref,
  sectionSessionsUrl,
  sectionViewOf,
  staffCalendarChoice,
} from '../coordinator-sessions'

// E10-S08 (#273, REQ-A10): the coordinator's section calendar on the phone — which calendar a staff person sees, the
// view chips in the URL and the list reads behind the views and the Today counts.
const TODAY = '2026-11-18'

describe('sectionViewOf', () => {
  it('names every view and falls back to All', () => {
    for (const view of SECTION_VIEWS) expect(sectionViewOf(view)).toBe(view)
    expect(sectionViewOf('calendar')).toBe('all')
    expect(sectionViewOf(null)).toBe('all')
    expect(sectionViewOf(undefined)).toBe('all')
  })

  it('counts the three views of the Today tile', () => {
    expect(SECTION_COUNT_VIEWS).toEqual(['unassigned', 'reschedule', 'unsettled'])
  })
})

describe('staffCalendarChoice', () => {
  it('keeps the own calendar in the member context and without the coordinator scope', () => {
    expect(staffCalendarChoice('coordinator', { staff: false, scopes: ['coach', 'coordinator'] })).toEqual({
      mode: 'mine',
      switcher: false,
    })
    expect(staffCalendarChoice('coordinator', { staff: true, scopes: ['coach'] })).toEqual({
      mode: 'mine',
      switcher: false,
    })
  })

  it('opens the section for a coordinator who does not coach, without the switch', () => {
    expect(staffCalendarChoice(null, { staff: true, scopes: ['coordinator'] })).toEqual({
      mode: 'section',
      switcher: false,
    })
  })

  it('offers the switch to a coordinator who coaches, "My sessions" by default', () => {
    const scopes = ['coach', 'coordinator']
    expect(staffCalendarChoice(null, { staff: true, scopes })).toEqual({ mode: 'mine', switcher: true })
    expect(staffCalendarChoice('coach', { staff: true, scopes })).toEqual({ mode: 'mine', switcher: true })
    expect(staffCalendarChoice('coordinator', { staff: true, scopes })).toEqual({ mode: 'section', switcher: true })
  })
})

describe('sectionCalendarHref', () => {
  it('keeps the perspective, the view and the section in the URL', () => {
    expect(sectionCalendarHref('all')).toBe('/club/calendar?as=coordinator')
    expect(sectionCalendarHref('unassigned')).toBe('/club/calendar?as=coordinator&view=unassigned')
    expect(sectionCalendarHref('cancelled', 's-1')).toBe('/club/calendar?as=coordinator&view=cancelled&section=s-1')
    expect(sectionCalendarHref('all', null)).toBe('/club/calendar?as=coordinator')
  })
})

describe('sectionSessionsUrl', () => {
  const query = (url: string) => Object.fromEntries(new URL(url, 'http://x').searchParams)

  it('reads each view with the panel list query and its window, by start time', () => {
    expect(query(sectionSessionsUrl('unassigned', TODAY))).toEqual({
      unassigned: '1',
      from: TODAY,
      to: '2026-12-02',
      sortField: 'startAt',
      sortDir: 'asc',
      pageSize: String(SECTION_LIST_PAGE_SIZE),
    })
    expect(query(sectionSessionsUrl('reschedule', TODAY))).toEqual({
      status: 'planned',
      needsReschedule: 'true',
      sortField: 'startAt',
      sortDir: 'asc',
      pageSize: String(SECTION_LIST_PAGE_SIZE),
    })
    expect(query(sectionSessionsUrl('unsettled', TODAY, { pageSize: 1 }))).toEqual({
      unsettled: '1',
      sortField: 'startAt',
      sortDir: 'asc',
      pageSize: '1',
    })
    expect(query(sectionSessionsUrl('cancelled', TODAY, { sectionId: 's-1' }))).toEqual({
      status: 'cancelled',
      from: '2026-11-11',
      to: '2026-12-02',
      sectionId: 's-1',
      sortField: 'startAt',
      sortDir: 'asc',
      pageSize: String(SECTION_LIST_PAGE_SIZE),
    })
    expect(sectionSessionsUrl('unsettled', TODAY).startsWith('/api/activities/occurrences?')).toBe(true)
  })
})
