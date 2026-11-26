// The browser's install offer (D-045, E31-S01 #873): the store keeps `beforeinstallprompt`, drops it after
// installation or use, and the member menu shows "Install" only while an offer is held and a label is provided.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  MemberInstallLabelContext,
  createInstallPromptStore,
  installPromptStore,
  promptInstall,
  useInstallAvailable,
} from '../member/install-prompt.ts'
import { MemberShell } from '../member/member-shell.tsx'
import { memberNav } from '../member/member-nav.ts'

function offer(outcome = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true })
  let prompted = 0
  event.prompt = async () => {
    prompted += 1
  }
  event.userChoice = Promise.resolve({ outcome })
  return { event, prompted: () => prompted }
}

test('keeps the offer, prevents the mini-infobar, notifies listeners and stops listening', () => {
  const store = createInstallPromptStore()
  const target = new EventTarget()
  const stop = store.capture(target)
  let notified = 0
  const unsubscribe = store.subscribe(() => {
    notified += 1
  })
  assert.equal(store.available(), false)
  // An event without `prompt` (another sender) is ignored.
  target.dispatchEvent(new Event('beforeinstallprompt'))
  assert.equal(store.available(), false)
  const { event } = offer()
  target.dispatchEvent(event)
  assert.equal(event.defaultPrevented, true)
  assert.equal(store.available(), true)
  assert.equal(notified, 1)
  // Installed from the browser's own menu: the offer is gone.
  target.dispatchEvent(new Event('appinstalled'))
  assert.equal(store.available(), false)
  unsubscribe()
  stop()
  target.dispatchEvent(offer().event)
  assert.equal(store.available(), false)
  assert.equal(notified, 2)
})

test('prompts once and answers the choice; without an offer it is unavailable', async () => {
  const store = createInstallPromptStore()
  const target = new EventTarget()
  store.capture(target)
  assert.equal(await store.prompt(), 'unavailable')
  const first = offer('dismissed')
  target.dispatchEvent(first.event)
  assert.equal(await store.prompt(), 'dismissed')
  assert.equal(first.prompted(), 1)
  assert.equal(store.available(), false)
  assert.equal(await store.prompt(), 'unavailable')
})

test('the hook reads the store', () => {
  const store = createInstallPromptStore()
  const target = new EventTarget()
  store.capture(target)
  const Probe = ({ value }) => React.createElement('span', null, String(useInstallAvailable(value)))
  assert.equal(renderToStaticMarkup(React.createElement(Probe, { value: store })), '<span>false</span>')
  target.dispatchEvent(offer().event)
  assert.equal(renderToStaticMarkup(React.createElement(Probe, { value: store })), '<span>true</span>')
})

test('More shows Install only with an offer and a label, and the entry prompts the app store', async () => {
  const h = React.createElement
  const Link = (props) => h('a', { href: props.href, className: props.className }, props.children)
  const labels = new Proxy({}, { get: (_target, key) => String(key) })
  const shell = h(
    MemberShell,
    {
      brand: { name: 'KS Avocado' },
      nav: memberNav({ pathname: '/club', contexts: ['self'], labels, features: [] }),
      navLabel: 'Member area',
      signOutLabel: 'Sign out',
      Link,
    },
    h('p', null, 'body'),
  )
  const withLabel = (label) => h(MemberInstallLabelContext.Provider, { value: label }, shell)
  assert.doesNotMatch(renderToStaticMarkup(withLabel('Install the app')), /club-install/)

  const target = new EventTarget()
  const stop = installPromptStore.capture(target)
  const app = offer()
  target.dispatchEvent(app.event)
  // No label (no provider): no entry.
  assert.doesNotMatch(renderToStaticMarkup(shell), /club-install/)
  const html = renderToStaticMarkup(withLabel('Install the app'))
  assert.match(
    html,
    /<button type="button" class="hover:bg-accent[^"]*min-h-12[^"]*" data-testid="club-install"><svg[^>]*aria-hidden="true"[^>]*>.*?<\/svg><span>Install the app<\/span><\/button><form action="\/api\/auth\/logout" method="post">/,
  )
  promptInstall()
  await app.event.userChoice
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(app.prompted(), 1)
  assert.equal(installPromptStore.available(), false)
  stop()
})
