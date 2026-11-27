// The life cycle of an application (sign-up form spec *Domain Vocabulary* → State; DD-J09; #799): `unconfirmed` until
// the applicant confirms the e-mail, then `new` (or `waiting` for a chosen group that is full), `trial`, `waiting`, and
// one of the closed states. Pure and client-safe: the commands ask `assertTransition` with this table.
import { defineTransitions } from '@vereino/core'

export const APPLICATION_STATES = [
  'unconfirmed',
  'new',
  'trial',
  'waiting',
  'accepted',
  'rejected',
  'withdrawn',
  'expired',
] as const

export type ApplicationState = (typeof APPLICATION_STATES)[number]

/** Open states: the application still waits for something (the BR-J3 duplicate rule counts these). */
export const OPEN_STATES = ['unconfirmed', 'new', 'trial', 'waiting'] as const satisfies readonly ApplicationState[]

/** Confirmed open states: the club sees the application and the coordinator decides it. */
export const DECIDABLE_STATES = ['new', 'trial', 'waiting'] as const satisfies readonly ApplicationState[]

/** Closed states: anonymised 30 days after `closed_at` (R23). */
export const CLOSED_STATES = [
  'accepted',
  'rejected',
  'withdrawn',
  'expired',
] as const satisfies readonly ApplicationState[]

export type ApplicationKind = 'child' | 'adult'

export const APPLICATION_KINDS = ['child', 'adult'] as const satisfies readonly ApplicationKind[]

export type AgeFit = 'fits' | 'outside' | 'unknown'

export const EXPERIENCE_LEVELS = ['none', 'under_year', 'year_or_more'] as const

export type Experience = (typeof EXPERIENCE_LEVELS)[number]

export const applicationTransitions = defineTransitions({
  states: APPLICATION_STATES,
  entry: ['unconfirmed'],
  transitions: [
    ['unconfirmed', 'new'],
    ['unconfirmed', 'waiting'],
    ['new', 'accepted'],
    ['new', 'rejected'],
    ['new', 'withdrawn'],
    ['new', 'trial'],
    ['new', 'waiting'],
    ['new', 'expired'],
    ['trial', 'accepted'],
    ['trial', 'rejected'],
    ['trial', 'withdrawn'],
    ['trial', 'trial'],
    ['trial', 'waiting'],
    ['trial', 'new'],
    ['trial', 'expired'],
    ['waiting', 'accepted'],
    ['waiting', 'rejected'],
    ['waiting', 'withdrawn'],
    ['waiting', 'trial'],
    ['waiting', 'waiting'],
    // DD-J15a (phase 3, #800): a season rollover closed the group, so the application goes back to the coordinator.
    ['waiting', 'new'],
    ['waiting', 'expired'],
  ],
  terminal: ['accepted', 'rejected', 'withdrawn', 'expired'],
})

export function isOpenState(state: string): boolean {
  return (OPEN_STATES as readonly string[]).includes(state)
}

export function isDecidableState(state: string): boolean {
  return (DECIDABLE_STATES as readonly string[]).includes(state)
}

export function isClosedState(state: string): boolean {
  return (CLOSED_STATES as readonly string[]).includes(state)
}
