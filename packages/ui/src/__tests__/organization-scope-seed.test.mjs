// The organization scope seed: a backend page starts at the scope of its cookies, so its lists load once (lesson
// `admin-lists-load-once-scope-seed`).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ALL_ORGANIZATIONS_COOKIE_VALUE,
  ORGANIZATION_COOKIE,
  TENANT_COOKIE,
  createOrganizationScopeSeed,
  organizationScopeSeed,
  platformScopeBus,
  readCookie,
  scopeFromCookies,
} from '../admin/organization-scope-seed.ts'

const ORG = '11111111-1111-4111-8111-111111111111'
const TENANT = '22222222-2222-4222-8222-222222222222'
const cookies = (org, tenant) =>
  [
    org === undefined ? null : `${ORGANIZATION_COOKIE}=${org}`,
    tenant === undefined ? null : `${TENANT_COOKIE}=${tenant}`,
  ]
    .filter(Boolean)
    .join('; ')

test('the cookie names are the switcher’s', () => {
  assert.equal(ORGANIZATION_COOKIE, 'om_selected_org')
  assert.equal(TENANT_COOKIE, 'om_selected_tenant')
  assert.equal(ALL_ORGANIZATIONS_COOKIE_VALUE, '__all__')
})

test('readCookie decodes one cookie and keeps a value it cannot decode', () => {
  assert.equal(readCookie('a=1; om_selected_org=x%20y', ORGANIZATION_COOKIE), 'x y')
  assert.equal(readCookie('om_selected_org=%E0%A4%A', ORGANIZATION_COOKIE), '%E0%A4%A')
  assert.equal(readCookie('om_selected_organization=1', ORGANIZATION_COOKIE), null)
  assert.equal(readCookie('', ORGANIZATION_COOKIE), null)
})

test('scopeFromCookies reads the scope only when both cookies are there', () => {
  assert.deepEqual(scopeFromCookies(cookies(ORG, TENANT)), { organizationId: ORG, tenantId: TENANT })
  assert.deepEqual(scopeFromCookies(cookies(ALL_ORGANIZATIONS_COOKIE_VALUE, TENANT)), {
    organizationId: null,
    tenantId: TENANT,
  })
  assert.deepEqual(scopeFromCookies(cookies('', TENANT)), { organizationId: null, tenantId: TENANT })
  assert.equal(scopeFromCookies(cookies(undefined, TENANT)), null)
  assert.equal(scopeFromCookies(cookies(ORG, undefined)), null)
  assert.equal(scopeFromCookies(cookies(ORG, '')), null)
})

// A bus that records what reaches the platform, with the platform's rule: an unchanged emission after the first one
// is not dispatched.
function recordingBus() {
  const log = []
  let scope = { organizationId: null, tenantId: null }
  let emitted = false
  return {
    log,
    bus: {
      emit: (detail) => {
        const changed = scope.organizationId !== detail.organizationId || scope.tenantId !== detail.tenantId
        if (changed || !emitted) log.push(['dispatched by the platform', detail])
        scope = { ...detail }
        emitted = true
      },
      current: () => ({ ...scope }),
      dispatch: (detail) => log.push(['dispatched by the seed', detail]),
    },
  }
}

test('after a seed the switcher’s matching answer changes nothing and is announced once', () => {
  const { log, bus } = recordingBus()
  const seed = createOrganizationScopeSeed(bus)
  const scope = { organizationId: ORG, tenantId: TENANT }
  assert.equal(seed.seed(cookies(ORG, TENANT)), true)
  seed.announce(scope)
  seed.announce(scope)
  assert.deepEqual(log, [
    ['dispatched by the platform', scope],
    ['dispatched by the seed', scope],
  ])
})

test('a different answer after a seed is a real change, dispatched by the platform', () => {
  const { log, bus } = recordingBus()
  const seed = createOrganizationScopeSeed(bus)
  seed.seed(cookies(ORG, TENANT))
  const other = { organizationId: null, tenantId: TENANT }
  seed.announce(other)
  assert.deepEqual(log.at(-1), ['dispatched by the platform', other])
  assert.equal(log.length, 2)
})

test('without cookies there is no seed and the switcher’s answer is the platform’s first emission', () => {
  const { log, bus } = recordingBus()
  const seed = createOrganizationScopeSeed(bus)
  assert.equal(seed.seed(''), false)
  const scope = { organizationId: null, tenantId: null }
  seed.announce(scope)
  assert.deepEqual(log, [['dispatched by the platform', scope]])
})

test('the platform bus emits, reads and dispatches the platform scope event on window', () => {
  const events = []
  globalThis.window = new EventTarget()
  try {
    window.addEventListener('om:organization-scope-changed', (event) => events.push(event.detail))
    const scope = { organizationId: ORG, tenantId: TENANT }
    platformScopeBus.emit(scope)
    assert.deepEqual(platformScopeBus.current(), scope)
    platformScopeBus.dispatch(scope)
    assert.deepEqual(events, [scope, scope])
    assert.equal(typeof organizationScopeSeed.seed, 'function')
  } finally {
    delete globalThis.window
  }
})
