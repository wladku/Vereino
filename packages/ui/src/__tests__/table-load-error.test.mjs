// E20-S18 (#497): a list that could not load says so in its own words and offers "Try again".
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TableLoadError } from '../admin/table-load-error.tsx'

const h = React.createElement

test('the error is an alert with the message and a retry button', () => {
  const html = renderToStaticMarkup(
    h(TableLoadError, { message: 'The sections could not be loaded.', retryLabel: 'Try again', onRetry: () => {} }),
  )
  assert.match(html, /role="alert"/)
  assert.match(html, /data-testid="table-load-error"/)
  assert.match(html, /The sections could not be loaded\./)
  assert.match(html, /<button[^>]*type="button"[^>]*>.*Try again<\/button>/)
  assert.match(html, /aria-hidden="true"/)
})

test('the retry button calls onRetry without the click event', () => {
  const calls = []
  const element = TableLoadError({
    message: 'm',
    retryLabel: 'r',
    onRetry: (...args) => calls.push(args),
    testId: 'own',
  })
  assert.equal(element.props['data-testid'], 'own')
  const button = React.Children.toArray(element.props.children)[1]
  button.props.onClick({ type: 'click' })
  assert.deepEqual(calls, [[]])
})
