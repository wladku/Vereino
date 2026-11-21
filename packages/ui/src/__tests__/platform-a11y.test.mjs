// E20-S18 (#497): the accessibility repairs of platform markup name CrudForm controls by their labels, table search
// boxes by their placeholders, give the breadcrumb's icon page a role and start AppShell link names with their text —
// and change nothing on a second pass.
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  BREADCRUMB_PAGE_SELECTOR,
  CRUD_CONTROL_SELECTOR,
  CRUD_FIELD_SELECTOR,
  SEARCH_INPUT_SELECTOR,
  SHELL_LINK_SELECTOR,
  WATCHED_ATTRIBUTES,
  browserObserver,
  browserRepairRoot,
  createRepairIds,
  labelCrudField,
  labelSearchInput,
  matchLinkName,
  platformA11yEffect,
  repairPlatformA11y,
  roleBreadcrumbPage,
  watchPlatformA11y,
} from '../admin/platform-a11y.ts'
import { PlatformA11yRepairs } from '../admin/platform-a11y-repairs.tsx'

// A minimal element: attributes, children, `contains` over the child tree, `closest('label')` over the parent chain and
// `querySelector(CRUD_CONTROL_SELECTOR)` as the first descendant marked `control`.
class FakeElement {
  constructor(tagName, { attributes = {}, text = '', children = [], control = false } = {}) {
    this.tagName = tagName.toUpperCase()
    this.attributes = new Map(Object.entries(attributes))
    this.text = text
    this.children = children
    this.control = control
    this.parent = null
    for (const child of children) child.parent = this
  }
  get id() {
    return this.attributes.get('id') ?? ''
  }
  set id(value) {
    this.attributes.set('id', value)
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
  contains(other) {
    return other === this || this.children.some((child) => child.contains(other))
  }
  closest(selector) {
    assert.equal(selector, 'label')
    for (let node = this; node; node = node.parent) if (node.tagName === 'LABEL') return node
    return null
  }
  querySelector(selector) {
    assert.equal(selector, CRUD_CONTROL_SELECTOR)
    for (const child of this.children) {
      if (child.control) return child
      const found = child.querySelector(selector)
      if (found) return found
    }
    return null
  }
}
const el = (tagName, options) => new FakeElement(tagName, options)
const root = (bySelector) => ({ querySelectorAll: (selector) => bySelector[selector] ?? [] })

const crudField = ({ label = 'Name *', control = el('input', { control: true }), wrapLabel = false } = {}) => {
  const labelElement = el('label', { text: label, children: wrapLabel ? [control] : [] })
  return {
    field: el('div', { children: wrapLabel ? [labelElement] : [labelElement, control] }),
    label: labelElement,
    control,
  }
}

test('a CrudForm control is named by its field label, once', () => {
  const ids = createRepairIds('t')
  const { field, label, control } = crudField()
  assert.equal(labelCrudField(field, ids), true)
  assert.equal(label.id, 't-1')
  assert.equal(control.getAttribute('aria-labelledby'), 't-1')
  assert.equal(labelCrudField(field, ids), false)
})

test('a label that already has an id keeps it; an empty select trigger is named by the label', () => {
  const trigger = el('button', { attributes: { role: 'combobox' }, control: true })
  const { field, label } = crudField({ control: el('div', { children: [trigger] }) })
  label.id = 'own'
  assert.equal(labelCrudField(field, createRepairIds()), true)
  assert.equal(trigger.getAttribute('aria-labelledby'), 'own')
})

test('a control showing text is named by the label and its own text, keeping an id it has', () => {
  const ids = createRepairIds('t')
  const trigger = el('button', { attributes: { role: 'combobox' }, text: ' Active ', control: true })
  const { field } = crudField({ control: trigger })
  assert.equal(labelCrudField(field, ids), true)
  assert.equal(trigger.getAttribute('aria-labelledby'), 't-1 t-2')
  assert.equal(trigger.id, 't-2')
  const owned = el('button', { attributes: { id: 'picker' }, text: '12.05.2026', control: true })
  assert.equal(labelCrudField(crudField({ control: owned }).field, ids), true)
  assert.equal(owned.getAttribute('aria-labelledby'), 't-3 picker')
})

test('fields without a label, with an empty label, without a control or with a named control are left alone', () => {
  const ids = createRepairIds()
  assert.equal(labelCrudField(el('div', { children: [el('input', { control: true })] }), ids), false)
  assert.equal(labelCrudField(crudField({ label: '  ' }).field, ids), false)
  assert.equal(labelCrudField(el('div', { children: [el('label', { text: 'Name' })] }), ids), false)
  assert.equal(labelCrudField(crudField({ wrapLabel: true }).field, ids), false)
  const named = el('input', { attributes: { 'aria-label': 'Date of birth' }, control: true })
  assert.equal(labelCrudField(crudField({ control: named }).field, ids), false)
  const labelled = el('input', { attributes: { 'aria-labelledby': 'x' }, control: true })
  assert.equal(labelCrudField(crudField({ control: labelled }).field, ids), false)
  const inOwnLabel = el('input', { control: true })
  const ownLabel = el('label', { text: 'Agree', children: [inOwnLabel] })
  assert.equal(labelCrudField(crudField({ control: el('span', { children: [ownLabel] }) }).field, ids), false)
})

test('a search box is named by its placeholder unless it has a name or no placeholder', () => {
  const search = el('input', { attributes: { placeholder: ' Search  people ' } })
  assert.equal(labelSearchInput(search), true)
  assert.equal(search.getAttribute('aria-label'), 'Search people')
  assert.equal(labelSearchInput(search), false)
  assert.equal(labelSearchInput(el('input')), false)
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
    [CRUD_FIELD_SELECTOR]: [crudField().field, crudField({ wrapLabel: true }).field],
    [SEARCH_INPUT_SELECTOR]: [el('input', { attributes: { placeholder: 'Search' } })],
    [BREADCRUMB_PAGE_SELECTOR]: [el('span', { attributes: { 'aria-label': 'Dashboard' } })],
    [SHELL_LINK_SELECTOR]: [el('a', { attributes: { 'aria-label': 'Back to Main' }, text: 'Settings' })],
  })
  const ids = createRepairIds()
  assert.equal(repairPlatformA11y(page, ids), 4)
  assert.equal(repairPlatformA11y(page, ids), 0)
  assert.equal(createRepairIds()(), 'vereino-a11y-1')
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
  const fields = []
  const page = root({ [CRUD_FIELD_SELECTOR]: fields })
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
  const { field, control } = crudField()
  fields.push(field)
  state.callback()
  state.callback()
  assert.equal(queued.length, 1)
  queued.shift()()
  assert.equal(control.getAttribute('aria-labelledby'), 'vereino-a11y-1')
  const late = crudField()
  fields.push(late.field)
  state.callback()
  stop()
  queued.shift()()
  assert.equal(late.control.getAttribute('aria-labelledby'), null)
  assert.equal(state.disconnected, true)
})

test('the watcher batches on a microtask by default', async () => {
  const fields = []
  const { state, create } = fakeObserver()
  watchPlatformA11y(root({ [CRUD_FIELD_SELECTOR]: fields }), create)
  const { field, control } = crudField()
  fields.push(field)
  state.callback()
  await Promise.resolve()
  assert.equal(control.getAttribute('aria-labelledby'), 'vereino-a11y-1')
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
