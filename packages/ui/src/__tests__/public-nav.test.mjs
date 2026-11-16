// The links of the public header (navigation spec REQ-N09; E09-S07 #261): the order, the optional Facilities and
// Events links, the sign-in link carrying the club's slug and the current page's link.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PUBLIC_HEADER_LABEL_KEYS, publicClubHref, publicNavLinks, publicSignInHref } from '../public/public-nav.ts'

const labels = Object.fromEntries(PUBLIC_HEADER_LABEL_KEYS.map((key) => [key, `label:${key}`]))
const links = (pathname, nav = { facilities: false, events: false }, slug = 'ks-avocado') =>
  publicNavLinks({ slug, nav, pathname, labels })
const current = (pathname, nav) =>
  links(pathname, nav)
    .filter((link) => link.current)
    .map((link) => link.id)

test('hrefs of the club page and the club sign-in encode the slug', () => {
  assert.equal(publicClubHref('ks-avocado'), '/p/ks-avocado')
  assert.equal(publicSignInHref('a b'), '/login?club=a%20b')
})

test('without the optional blocks: Club, Sections, Sign in', () => {
  assert.deepEqual(links('/p/ks-avocado'), [
    { id: 'club', href: '/p/ks-avocado', label: 'label:club', current: true },
    { id: 'sections', href: '/p/ks-avocado#sections', label: 'label:sections', current: false },
    { id: 'signIn', href: '/login?club=ks-avocado', label: 'label:signIn', current: false },
  ])
})

test('Facilities and Events appear only while the club publishes them, in their place', () => {
  const all = links('/p/ks-avocado', { facilities: true, events: true })
  assert.deepEqual(
    all.map((link) => [link.id, link.href]),
    [
      ['club', '/p/ks-avocado'],
      ['sections', '/p/ks-avocado#sections'],
      ['facilities', '/p/ks-avocado/places'],
      ['events', '/p/ks-avocado/events'],
      ['signIn', '/login?club=ks-avocado'],
    ],
  )
  assert.deepEqual(
    links('/p/ks-avocado', { facilities: false, events: true }).map((link) => link.id),
    ['club', 'sections', 'events', 'signIn'],
  )
})

test('the current link follows the page; sign-in and other pages mark none', () => {
  const nav = { facilities: true, events: true }
  assert.deepEqual(current('/p/ks-avocado/', nav), ['club'])
  assert.deepEqual(current('/p/ks-avocado/sections/football', nav), ['sections'])
  assert.deepEqual(current('/p/ks-avocado/places', nav), ['facilities'])
  assert.deepEqual(current('/p/ks-avocado/places/hall/', nav), ['facilities'])
  assert.deepEqual(current('/p/ks-avocado/events', nav), ['events'])
  assert.deepEqual(current('/p/ks-avocado/s/0d4f', nav), [])
  assert.deepEqual(current('/p/ks-avocado/requests/verify/abc', nav), [])
  assert.deepEqual(current('/p/ks-avocado-two', nav), [])
  assert.deepEqual(current('/p/ks-avocado/placesx', nav), [])
})
