// `dateField` and `timeField` build CrudForm custom fields around a native, labelled input.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { dateField, timeField } from '../admin/native-fields.tsx'

const render = (field, props) => field.component({ id: field.id, setValue: () => undefined, ...props })
const inputTag = (element) => /<input[^>]*>/.exec(renderToStaticMarkup(element))[0]
const target = (value, badInput) => ({ target: { value, validity: { badInput } } })

test('dateField renders a labelled date input with its bounds and keeps the CrudForm options', () => {
  const field = dateField('birthDate', 'Date of birth', { layout: 'half', min: '1906-11-03', max: '2026-11-03' })
  assert.equal(field.type, 'custom')
  assert.equal(field.id, 'birthDate')
  assert.equal(field.layout, 'half')
  assert.equal('min' in field, false)
  const html = inputTag(render(field, { value: '2014-05-03' }))
  assert.match(html, /type="date"/)
  assert.match(html, /aria-label="Date of birth"/)
  assert.match(html, /min="1906-11-03"/)
  assert.match(html, /max="2026-11-03"/)
  assert.match(html, /value="2014-05-03"/)
  assert.doesNotMatch(html, /aria-invalid/)
  assert.doesNotMatch(html, /aria-required/)
})

test('timeField marks a required, invalid field and passes typed values to setValue', () => {
  const field = timeField('startTime', 'Start', { required: true })
  const values = []
  const element = render(field, { value: 1700, error: 'Required', setValue: (value) => values.push(value) })
  const html = inputTag(element)
  assert.match(html, /type="time"/)
  assert.match(html, /aria-invalid="true"/)
  assert.match(html, /aria-required="true"/)
  assert.match(html, /value=""/)
  assert.doesNotMatch(html, /min=/)
  element.props.onChange(target('17:00', false))
  element.props.onChange(target('', true))
  element.props.onBlur(target('', true))
  assert.deepEqual(values, ['17:00', ''])
})

test('with incompleteValue a partly typed date is stored as that value and shown as empty', () => {
  const values = []
  const field = dateField('birthDate', 'Date of birth', { incompleteValue: 'incomplete' })
  const element = render(field, { value: 'incomplete', setValue: (value) => values.push(value) })
  assert.match(renderToStaticMarkup(element), /value=""/)
  element.props.onChange(target('', true))
  element.props.onChange(target('2014-05-03', false))
  element.props.onBlur(target('', true))
  element.props.onBlur(target('2014-05-03', false))
  element.props.onChange({ target: { value: '' } })
  assert.deepEqual(values, ['incomplete', '2014-05-03', 'incomplete', ''])
})

test('a disabled or read-only option reaches the input', () => {
  assert.match(renderToStaticMarkup(render(dateField('d', 'Date', { disabled: true }), {})), /disabled=""/)
  assert.match(renderToStaticMarkup(render(dateField('d', 'Date'), { disabled: true })), /disabled=""/)
  assert.match(renderToStaticMarkup(render(dateField('d', 'Date', { readOnly: true }), {})), /readonly=""/i)
  assert.equal(React.isValidElement(render(dateField('d', 'Date'), {})), true)
})
