// E20-S02 (#481, WCAG 2.4.3): a dialog opened from state returns focus to the element that opened it when it closes,
// unless that element has left the page or the consumer's own close handler took over.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Dialog, DialogContent as PlatformDialogContent } from '@open-mercato/ui/primitives/dialog'
import { Sheet, SheetContent as PlatformSheetContent } from '@open-mercato/ui/primitives/sheet'
import { I18nProvider } from '@open-mercato/shared/lib/i18n/context'
import { createReturnFocus, focusedElement, withReturnFocus } from '../admin/return-focus.ts'
import { useReturnFocus, withReturnFocusContent } from '../admin/return-focus-content.ts'

const h = React.createElement

function autoFocusEvent() {
  const event = {
    defaultPrevented: false,
    preventDefault() {
      event.defaultPrevented = true
    },
  }
  return event
}

function focusable(isConnected = true) {
  const element = {
    isConnected,
    focused: 0,
    focus() {
      element.focused += 1
    },
  }
  return element
}

function withDocument(value, run) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'document')
  const previous = globalThis.document
  globalThis.document = value
  try {
    return run()
  } finally {
    if (had) globalThis.document = previous
    else delete globalThis.document
  }
}

test('the focused element: none outside a browser, none when only the body has focus', () => {
  assert.equal(focusedElement(), null)
  const body = {}
  const button = {}
  assert.equal(
    withDocument({ body, activeElement: body }, () => focusedElement()),
    null,
  )
  assert.equal(
    withDocument({ body, activeElement: null }, () => focusedElement()),
    null,
  )
  assert.equal(
    withDocument({ body, activeElement: button }, () => focusedElement()),
    button,
  )
})

test('closing returns focus to the element focused when the dialog opened, once', () => {
  const trigger = focusable()
  let active = trigger
  const handlers = createReturnFocus(() => active)
  handlers.onOpenAutoFocus(autoFocusEvent())
  active = null
  const close = autoFocusEvent()
  handlers.onCloseAutoFocus(close)
  assert.equal(trigger.focused, 1)
  assert.equal(close.defaultPrevented, true)
  const again = autoFocusEvent()
  handlers.onCloseAutoFocus(again)
  assert.equal(trigger.focused, 1)
  assert.equal(again.defaultPrevented, false)
})

test('an opener that has left the page, or none, leaves the close to Radix', () => {
  const gone = focusable(false)
  const handlers = createReturnFocus(() => gone)
  handlers.onOpenAutoFocus(autoFocusEvent())
  const close = autoFocusEvent()
  handlers.onCloseAutoFocus(close)
  assert.equal(gone.focused, 0)
  assert.equal(close.defaultPrevented, false)

  const nothing = createReturnFocus(() => null)
  nothing.onOpenAutoFocus(autoFocusEvent())
  const closeNothing = autoFocusEvent()
  nothing.onCloseAutoFocus(closeNothing)
  assert.equal(closeNothing.defaultPrevented, false)
  assert.equal(typeof createReturnFocus().onOpenAutoFocus, 'function')
})

test('composed handlers: the opener is recorded before the consumer moves focus; a consumer close that prevents wins', () => {
  const trigger = focusable()
  const field = focusable()
  let active = trigger
  const calls = []
  const props = withReturnFocus(
    {
      title: 'kept',
      onOpenAutoFocus: (event) => {
        calls.push('open')
        event.preventDefault()
        active = field
      },
      onCloseAutoFocus: (event) => {
        calls.push('close')
        event.preventDefault()
      },
    },
    createReturnFocus(() => active),
  )
  assert.equal(props.title, 'kept')
  props.onOpenAutoFocus(autoFocusEvent())
  props.onCloseAutoFocus(autoFocusEvent())
  assert.deepEqual(calls, ['open', 'close'])
  assert.equal(trigger.focused, 0)

  const plain = withReturnFocus(
    {},
    createReturnFocus(() => trigger),
  )
  plain.onOpenAutoFocus(autoFocusEvent())
  plain.onCloseAutoFocus(autoFocusEvent())
  assert.equal(trigger.focused, 1)

  const observing = withReturnFocus(
    { onCloseAutoFocus: () => calls.push('observed') },
    createReturnFocus(() => field),
  )
  observing.onOpenAutoFocus(autoFocusEvent())
  observing.onCloseAutoFocus(autoFocusEvent())
  assert.equal(field.focused, 1)
  assert.equal(calls.at(-1), 'observed')
})

test('a wrapped content passes the composed handlers and the ref to the platform content', () => {
  const seen = []
  function Probe() {
    seen.push(useReturnFocus())
    return null
  }
  renderToStaticMarkup(h(Probe))
  assert.equal(typeof seen[0].onCloseAutoFocus, 'function')

  const received = []
  const Content = React.forwardRef(function Content(props, ref) {
    received.push({ props, ref })
    return h('div', null, props.children)
  })
  const Wrapped = withReturnFocusContent(Content, 'WrappedContent')
  assert.equal(Wrapped.displayName, 'WrappedContent')
  const ref = React.createRef()
  const own = () => undefined
  assert.equal(renderToStaticMarkup(h(Wrapped, { ref, onCloseAutoFocus: own }, 'Body')), '<div>Body</div>')
  assert.equal(received[0].ref, ref)
  assert.equal(typeof received[0].props.onOpenAutoFocus, 'function')
  assert.notEqual(received[0].props.onCloseAutoFocus, own)

  const DialogContent = withReturnFocusContent(PlatformDialogContent, 'DialogContent')
  const SheetContent = withReturnFocusContent(PlatformSheetContent, 'SheetContent')
  const inI18n = (child) => h(I18nProvider, { locale: 'en', dict: {} }, child)
  assert.doesNotThrow(() =>
    renderToStaticMarkup(inI18n(h(Dialog, { open: true }, h(DialogContent, { closeAriaLabel: 'Close' }, 'Body')))),
  )
  assert.doesNotThrow(() => renderToStaticMarkup(inI18n(h(Sheet, { open: true }, h(SheetContent, null, 'Body')))))
})
