// E20-S18 (#497): the accessibility repairs of platform markup name table search boxes by their placeholders, give the
// breadcrumb's icon page a role and start AppShell link names with their text — and change nothing on a second pass.
// (The CrudForm label repair went with Open Mercato 0.10.1, #498.)
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  BREADCRUMB_PAGE_SELECTOR,
  SEARCH_INPUT_SELECTOR,
  SHELL_LINK_SELECTOR,
  WATCHED_ATTRIBUTES,
  browserObserver,
  browserRepairRoot,
  labelSearchInput,
  matchLinkName,
  platformA11yEffect,
  repairPlatformA11y,
  roleBreadcrumbPage,
  watchPlatformA11y,
} from '../admin/platform-a11y.ts'
import { PlatformA11yRepairs } from '../admin/platform-a11y-repairs.tsx'

// A minimal element: attributes, children for `textContent`, and `closest('label')` over the parent chain.
class FakeElement {
  constructor(tagName, { attributes = {}, text = '', children = [] } = {}) {
    this.tagName = tagName.toUpperCase()
    this.attributes = new Map(Object.entries(attributes))
    this.text = text
    this.children = children
    this.parent = null
    for (const child of children) child.parent = this
  }
  get textContent() {
    return [this.text, ...this.children.map((child) => child.textContent)].join('')
  }
  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null
  }
  setAttribute(name, value) {
    this.attributes.set(name, value)
  }
  closest(selector) {
    assert.equal(selector, 'label')
    for (let node = this; node; node = node.parent) if (node.tagName === 'LABEL') return node
    return null
  }
}
const el = (tagName, options) => new FakeElement(tagName, options)
const root = (bySelector) => ({ querySelectorAll: (selector) => bySelector[selector] ?? [] })
const searchBox = () => el('input', { attributes: { placeholder: 'Search' } })

test('a search box is named by its placeholder unless it has a name or no placeholder', () => {
  const search = el('input', { attributes: { placeholder: ' Search  people ' } })
  assert.equal(labelSearchInput(search), true)
  assert.equal(search.getAttribute('aria-label'), 'Search people')
  assert.equal(labelSearchInput(search), false)
  assert.equal(labelSearchInput(el('input')), false)
  const labelled = el('input', { attributes: { placeholder: 'Search', 'aria-labelledby': 'x' } })
  assert.equal(labelSearchInput(labelled), false)
  const inLabel = el('input', { attributes: { placeholder: 'Search' } })
  el('label', { text: 'Find', children: [inLabel] })
  assert.equal(labelSearchInput(inLabel), false)
})

test('the breadcrumb icon page gets the img role only when it has a label and no role', () => {
  const page = el('span', { attributes: { 'aria-label': 'Dashboard' } })
  assert.equal(roleBreadcrumbPage(page), true)
  assert.equal(page.getAttribute('role'), 'img')
  assert.equal(roleBreadcrumbPage(page), false)
  assert.equal(roleBreadcrumbPage(el('span', { attributes: { 'aria-label': ' ' } })), false)
})

test('a shell link name starts with its visible text when the label leaves it out', () => {
  const brand = el('a', {
    attributes: { 'aria-label': 'Go to dashboard' },
    children: [el('span', { text: 'Vereino' })],
  })
  assert.equal(matchLinkName(brand), true)
  assert.equal(brand.getAttribute('aria-label'), 'Vereino – Go to dashboard')
  assert.equal(matchLinkName(brand), false)
  assert.equal(matchLinkName(el('a', { attributes: { 'aria-label': 'Go to dashboard' } })), false)
  assert.equal(matchLinkName(el('a', { text: 'Vereino' })), false)
  assert.equal(matchLinkName(el('a', { attributes: { 'aria-label': 'Open SETTINGS' }, text: 'Settings' })), false)
})

test('a full pass repairs each kind and counts the changes; the second pass changes nothing', () => {
  const page = root({
    [SEARCH_INPUT_SELECTOR]: [
      searchBox(),
      el('input', { attributes: { placeholder: 'Search', 'aria-label': 'Find' } }),
    ],
    [BREADCRUMB_PAGE_SELECTOR]: [el('span', { attributes: { 'aria-label': 'Dashboard' } })],
    [SHELL_LINK_SELECTOR]: [el('a', { attributes: { 'aria-label': 'Back to Main' }, text: 'Settings' })],
  })
  assert.equal(repairPlatformA11y(page), 3)
  assert.equal(repairPlatformA11y(page), 0)
})

const fakeObserver = () => {
  const state = { callback: null, observed: null, disconnected: false }
  const create = (callback) => {
    state.callback = callback
    return {
      observe: (target, options) => {
        state.observed = { target, options }
      },
      disconnect: () => {
        state.disconnected = true
      },
    }
  }
  return { state, create }
}

test('the watcher repairs at once, then once per batch of changes, and stops on cleanup', () => {
  const boxes = []
  const page = root({ [SEARCH_INPUT_SELECTOR]: boxes })
  const queued = []
  const { state, create } = fakeObserver()
  const stop = watchPlatformA11y(page, create, (run) => queued.push(run))
  assert.deepEqual(state.observed.options, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: WATCHED_ATTRIBUTES,
  })
  assert.equal(state.observed.target, page)
  const box = searchBox()
  boxes.push(box)
  state.callback()
  state.callback()
  assert.equal(queued.length, 1)
  queued.shift()()
  assert.equal(box.getAttribute('aria-label'), 'Search')
  const late = searchBox()
  boxes.push(late)
  state.callback()
  stop()
  queued.shift()()
  assert.equal(late.getAttribute('aria-label'), null)
  assert.equal(state.disconnected, true)
})

test('the watcher batches on a microtask by default', async () => {
  const boxes = []
  const { state, create } = fakeObserver()
  watchPlatformA11y(root({ [SEARCH_INPUT_SELECTOR]: boxes }), create)
  const box = searchBox()
  boxes.push(box)
  state.callback()
  await Promise.resolve()
  assert.equal(box.getAttribute('aria-label'), 'Search')
})

afterEach(() => {
  delete globalThis.document
  delete globalThis.MutationObserver
})

test('in a browser the effect watches the page body; outside it does nothing', () => {
  assert.equal(browserRepairRoot(), null)
  assert.equal(platformA11yEffect()(), undefined)
  const body = root({})
  globalThis.document = { body }
  globalThis.MutationObserver = class {
    constructor(callback) {
      this.callback = callback
    }
    observe(target) {
      this.target = target
    }
    disconnect() {}
  }
  assert.equal(browserRepairRoot(), body)
  const observer = browserObserver(() => undefined)
  assert.ok(observer instanceof globalThis.MutationObserver)
  const stop = platformA11yEffect()()
  assert.equal(typeof stop, 'function')
  stop()
})

test('the component renders nothing', () => {
  assert.equal(renderToStaticMarkup(React.createElement(PlatformA11yRepairs)), '')
})
