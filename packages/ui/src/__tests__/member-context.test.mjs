// The acting context of the member pages (README 3.1, M-02, M-03; E06-S19 #101): the role-context and ward
// switchers, the calendar query they ask for, and the per-person session-storage store.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  DEFAULT_MEMBER_CONTEXT,
  MEMBER_CONTEXT_STORAGE_KEY,
  browserSessionStorage,
  createMemberContextStore,
  memberCalendarScope,
  memberContextStore,
  memberRoles,
  memberSwitchers,
  reloadOnBackForwardRestore,
  resolveMemberContext,
  showsWardSwitcher,
  storedSelectionOf,
  useMemberContext,
} from '../member/member-context.ts'

const ola = { personId: 'w-ola', firstName: 'Ola', lastName: 'Nowak' }
const jas = { personId: 'w-jas', firstName: 'Jaś', lastName: 'Nowak' }
const profile = (overrides = {}) => ({
  person: { id: 'p-1' },
  wards: [ola, jas],
  contexts: ['self', 'guardian'],
  ...overrides,
})
const labels = {
  context: 'Acting as',
  contextMember: 'Guardian or member',
  contextCoach: 'Coach',
  ward: 'Showing',
  allWards: 'Everyone',
  me: 'Me',
}

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
  }
}

test('offers the role context to a member who also coaches, and the ward switcher to a guardian', () => {
  assert.deepEqual(memberRoles(profile()), ['member'])
  assert.deepEqual(memberRoles(profile({ contexts: ['self', 'guardian', 'coach'] })), ['member', 'coach'])
  assert.equal(showsWardSwitcher(profile(), DEFAULT_MEMBER_CONTEXT), true)
  assert.equal(showsWardSwitcher(profile({ wards: [ola] }), DEFAULT_MEMBER_CONTEXT), true)
  assert.equal(showsWardSwitcher(profile({ wards: [] }), DEFAULT_MEMBER_CONTEXT), false)
  assert.equal(showsWardSwitcher(profile(), { role: 'coach', ward: 'all' }), false)
})

test('keeps a stored choice only while it fits the profile', () => {
  const coach = profile({ contexts: ['self', 'coach'] })
  assert.deepEqual(resolveMemberContext(profile(), null), DEFAULT_MEMBER_CONTEXT)
  assert.deepEqual(resolveMemberContext(profile(), 'coach'), DEFAULT_MEMBER_CONTEXT)
  assert.deepEqual(resolveMemberContext(coach, { role: 'coach', ward: 'all' }), { role: 'coach', ward: 'all' })
  assert.deepEqual(resolveMemberContext(profile(), { role: 'coach', ward: 'w-ola' }), { role: 'member', ward: 'w-ola' })
  assert.deepEqual(resolveMemberContext(profile(), { role: 'member', ward: 'self' }), { role: 'member', ward: 'self' })
  assert.deepEqual(resolveMemberContext(profile(), { role: 'member', ward: 'w-gone' }), DEFAULT_MEMBER_CONTEXT)
  // With one ward that ward is "all": an id left from a profile with two wards falls back to it.
  const one = profile({ wards: [ola] })
  assert.deepEqual(resolveMemberContext(one, { role: 'member', ward: 'w-ola' }), DEFAULT_MEMBER_CONTEXT)
  assert.deepEqual(resolveMemberContext(one, { role: 'member', ward: 'self' }), { role: 'member', ward: 'self' })
})

test('turns the context into the calendar query', () => {
  const scope = (p, selection) => memberCalendarScope(p, selection)
  assert.deepEqual(scope(profile({ contexts: ['coach'] }), { role: 'coach', ward: 'w-ola' }), {
    as: 'coach',
    personId: null,
  })
  assert.deepEqual(scope(profile({ wards: [] }), DEFAULT_MEMBER_CONTEXT), { as: 'self', personId: null })
  assert.deepEqual(scope(profile(), DEFAULT_MEMBER_CONTEXT), { as: 'guardian', personId: null })
  assert.deepEqual(scope(profile({ wards: [ola] }), DEFAULT_MEMBER_CONTEXT), { as: 'guardian', personId: null })
  assert.deepEqual(scope(profile({ wards: [ola] }), { role: 'member', ward: 'self' }), { as: 'self', personId: null })
  assert.deepEqual(scope(profile(), { role: 'member', ward: 'self' }), { as: 'self', personId: null })
  assert.deepEqual(scope(profile(), { role: 'member', ward: 'w-ola' }), { as: 'guardian', personId: 'w-ola' })
})

test('builds the switchers and reports each change as a whole selection', () => {
  const changes = []
  const onChange = (next) => changes.push(next)
  assert.deepEqual(memberSwitchers(profile({ wards: [] }), DEFAULT_MEMBER_CONTEXT, onChange, labels), [])
  const oneWard = memberSwitchers(profile({ wards: [ola] }), DEFAULT_MEMBER_CONTEXT, onChange, labels)
  assert.deepEqual(
    oneWard.map(({ id, options }) => ({ id, options })),
    [
      {
        id: 'ward',
        options: [
          { value: 'all', label: 'Ola Nowak' },
          { value: 'self', label: 'Me' },
        ],
      },
    ],
  )

  const both = memberSwitchers(profile({ contexts: ['guardian', 'coach'] }), DEFAULT_MEMBER_CONTEXT, onChange, labels)
  assert.deepEqual(
    both.map(({ id, label, value, options }) => ({ id, label, value, options })),
    [
      {
        id: 'context',
        label: 'Acting as',
        value: 'member',
        options: [
          { value: 'member', label: 'Guardian or member' },
          { value: 'coach', label: 'Coach' },
        ],
      },
      {
        id: 'ward',
        label: 'Showing',
        value: 'all',
        options: [
          { value: 'all', label: 'Everyone' },
          { value: 'w-ola', label: 'Ola Nowak' },
          { value: 'w-jas', label: 'Jaś Nowak' },
          { value: 'self', label: 'Me' },
        ],
      },
    ],
  )
  both[0].onChange('coach')
  both[0].onChange('member')
  both[1].onChange('w-ola')
  assert.deepEqual(changes, [
    { role: 'coach', ward: 'all' },
    { role: 'member', ward: 'all' },
    { role: 'member', ward: 'w-ola' },
  ])

  const asCoach = memberSwitchers(profile({ contexts: ['coach'] }), { role: 'coach', ward: 'all' }, onChange, labels)
  assert.deepEqual(
    asCoach.map((switcher) => switcher.id),
    ['context'],
  )
})

test('reads a stored choice only for the person it was stored for', () => {
  assert.equal(storedSelectionOf(null, 'p-1'), null)
  assert.equal(storedSelectionOf('{not json', 'p-1'), null)
  assert.equal(storedSelectionOf('null', 'p-1'), null)
  assert.equal(storedSelectionOf('7', 'p-1'), null)
  assert.equal(storedSelectionOf('{"personId":"p-2","role":"coach"}', 'p-1'), null)
  assert.deepEqual(storedSelectionOf('{"personId":"p-1","role":"coach"}', 'p-1'), { personId: 'p-1', role: 'coach' })
})

test('the store writes, notifies, unsubscribes and clears', () => {
  const storage = memoryStorage()
  const store = createMemberContextStore(() => storage)
  let calls = 0
  const unsubscribe = store.subscribe(() => {
    calls += 1
  })
  assert.equal(store.snapshot(), null)
  store.write('p-1', { role: 'member', ward: 'w-ola' })
  assert.equal(storage.data.get(MEMBER_CONTEXT_STORAGE_KEY), '{"personId":"p-1","role":"member","ward":"w-ola"}')
  assert.equal(store.snapshot(), '{"personId":"p-1","role":"member","ward":"w-ola"}')
  store.clear()
  assert.equal(store.snapshot(), null)
  assert.equal(calls, 2)
  unsubscribe()
  store.write('p-1', DEFAULT_MEMBER_CONTEXT)
  assert.equal(calls, 2)
})

test('the store stays default without storage or when storage refuses access', () => {
  const missing = createMemberContextStore(() => null)
  missing.write('p-1', DEFAULT_MEMBER_CONTEXT)
  missing.clear()
  assert.equal(missing.snapshot(), null)
  const refusing = createMemberContextStore(() => {
    throw new Error('SecurityError')
  })
  refusing.write('p-1', DEFAULT_MEMBER_CONTEXT)
  assert.equal(refusing.snapshot(), null)
  assert.equal(browserSessionStorage(), null)
  assert.equal(memberContextStore.snapshot(), null)
})

test('the shared store uses the browser session storage when there is a window', () => {
  const sessionStorage = memoryStorage({ [MEMBER_CONTEXT_STORAGE_KEY]: '{"personId":"p-1"}' })
  globalThis.window = { sessionStorage }
  try {
    assert.equal(browserSessionStorage(), sessionStorage)
    assert.equal(memberContextStore.snapshot(), '{"personId":"p-1"}')
  } finally {
    delete globalThis.window
  }
})

test('the hook renders the default context on the server and writes through the store', () => {
  const storage = memoryStorage()
  const store = createMemberContextStore(() => storage)
  const seen = []
  const Probe = ({ value }) => {
    const [selection, setSelection] = useMemberContext(value, store)
    seen.push({ selection, setSelection })
    return React.createElement('span', null, `${selection.role}:${selection.ward}`)
  }
  assert.equal(renderToStaticMarkup(React.createElement(Probe, { value: profile() })), '<span>member:all</span>')
  assert.equal(renderToStaticMarkup(React.createElement(Probe, { value: null })), '<span>member:all</span>')
  seen[0].setSelection({ role: 'member', ward: 'w-jas' })
  assert.equal(storage.data.get(MEMBER_CONTEXT_STORAGE_KEY), '{"personId":"p-1","role":"member","ward":"w-jas"}')
  storage.data.clear()
  seen[1].setSelection({ role: 'member', ward: 'w-jas' })
  assert.equal(storage.data.size, 0)
  const Defaulted = () => {
    const [selection] = useMemberContext(profile())
    return React.createElement('span', null, selection.ward)
  }
  assert.equal(renderToStaticMarkup(React.createElement(Defaulted)), '<span>all</span>')
})

test('a page restored from the back-forward cache reloads, and the cleanup stops listening', () => {
  const listeners = new Map()
  let reloads = 0
  globalThis.window = {
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type, listener) => {
      if (listeners.get(type) === listener) listeners.delete(type)
    },
    location: {
      reload: () => {
        reloads += 1
      },
    },
  }
  try {
    const cleanup = reloadOnBackForwardRestore()
    listeners.get('pageshow')({ persisted: false })
    assert.equal(reloads, 0)
    listeners.get('pageshow')({ persisted: true })
    assert.equal(reloads, 1)
    cleanup()
    assert.equal(listeners.has('pageshow'), false)
  } finally {
    delete globalThis.window
  }
})
