// Unit tests for the dashboard widget title check (#484, E20-S05).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { APP_ROOT, readVereinoModuleIds } from '../vereino-paths.mjs'
import {
  checkWidgetTitles,
  formatWidgetTitleFinding,
  readWidgetMetadata,
  widgetCatalogKeys,
} from '../vereino-widget-titles.mjs'

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vereino-widget-titles-'))
after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }))

function write(root, relativePath, content) {
  const target = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, typeof content === 'string' ? content : JSON.stringify(content))
}

function widgetSource(id, { description = true } = {}) {
  return [
    'const widget = {',
    '  metadata: {',
    `    id: '${id}',`,
    "    title: 'Departure requests',",
    description ? "    description: 'Open requests.'," : '',
    '  },',
    '}',
  ].join('\n')
}

function appRoot() {
  return fs.mkdtempSync(path.join(fixtureRoot, 'app-'))
}

test('widgetCatalogKeys lists the keys DashboardScreen tries, most specific first', () => {
  assert.deepEqual(widgetCatalogKeys('people.dashboard.departureRequests', 'title'), [
    'people.dashboard.widgets.departureRequests.title',
    'people.dashboard.departureRequests.title',
    'dashboard.widgets.people.dashboard.departureRequests.title',
  ])
  assert.deepEqual(widgetCatalogKeys('welcome', 'description'), [
    'welcome.description',
    'dashboard.widgets.welcome.description',
  ])
})

test('readWidgetMetadata reads the literal id and whether a description is declared', () => {
  assert.deepEqual(readWidgetMetadata(widgetSource('a.dashboard.b')), { id: 'a.dashboard.b', hasDescription: true })
  assert.deepEqual(readWidgetMetadata(widgetSource('a.b', { description: false })), {
    id: 'a.b',
    hasDescription: false,
  })
  assert.deepEqual(readWidgetMetadata('const widget = { metadata: { id: WIDGET_ID } }'), {
    id: null,
    hasDescription: false,
  })
})

test('checkWidgetTitles passes widgets whose keys exist in every catalog, in any of the resolved forms', () => {
  const root = appRoot()
  write(
    root,
    'src/modules/people/widgets/dashboard/departure-requests/widget.ts',
    widgetSource('people.dashboard.departureRequests'),
  )
  write(root, 'src/modules/people/widgets/dashboard/departure-requests/widget.client.tsx', 'export default null')
  write(root, 'src/modules/people/widgets/dashboard/README.md', 'not a widget folder')
  write(
    root,
    'src/modules/people/widgets/dashboard/today/widget.tsx',
    widgetSource('people.dashboard.today', { description: false }),
  )
  write(root, 'src/modules/people/i18n/en.json', {
    'people.dashboard.widgets.departureRequests.title': 'Departure requests',
    'people.dashboard.widgets.departureRequests.description': 'Open requests.',
    'people.dashboard.today.title': 'Today',
  })
  write(root, 'src/modules/people/i18n/pl.json', {
    'people.dashboard.widgets.departureRequests.title': 'Prośby o odejście',
    'dashboard.widgets.people.dashboard.departureRequests.description': 'Otwarte prośby.',
    'people.dashboard.today.title': 'Dziś',
  })
  write(root, 'src/modules/people/i18n/.hardcoded-allowlist.json', { entries: [] })
  write(root, 'src/modules/groups/data/entities.ts', 'export {}')
  assert.deepEqual(checkWidgetTitles(root, ['people', 'groups', 'absent']), [])
})

test('checkWidgetTitles names the file, widget, field and locale of each missing or empty key', () => {
  const root = appRoot()
  write(root, 'src/modules/payments/widgets/dashboard/overdue/widget.ts', widgetSource('payments.dashboard.overdue'))
  write(root, 'src/modules/payments/i18n/en.json', {
    'payments.dashboard.widgets.overdue.title': 'Overdue',
    'payments.dashboard.widgets.overdue.description': 'What remains.',
  })
  write(root, 'src/modules/payments/i18n/pl.json', { 'payments.dashboard.widgets.overdue.title': '  ' })
  assert.deepEqual(checkWidgetTitles(root, ['payments']), [
    {
      file: 'src/modules/payments/widgets/dashboard/overdue/widget.ts',
      widgetId: 'payments.dashboard.overdue',
      field: 'title',
      locale: 'pl',
      key: 'payments.dashboard.widgets.overdue.title',
    },
    {
      file: 'src/modules/payments/widgets/dashboard/overdue/widget.ts',
      widgetId: 'payments.dashboard.overdue',
      field: 'description',
      locale: 'pl',
      key: 'payments.dashboard.widgets.overdue.description',
    },
  ])
})

test('checkWidgetTitles reports a widget without a literal id and a module without catalogs', () => {
  const root = appRoot()
  write(
    root,
    'src/modules/facilities/widgets/dashboard/requests/widget.ts',
    'export default { metadata: { id: WIDGET_ID } }',
  )
  write(root, 'src/modules/facilities/widgets/dashboard/today/widget.ts', widgetSource('facilities.dashboard.today'))
  assert.deepEqual(checkWidgetTitles(root, ['facilities']), [
    {
      file: 'src/modules/facilities/widgets/dashboard/requests/widget.ts',
      widgetId: null,
      field: 'id',
      locale: null,
      key: null,
    },
    {
      file: 'src/modules/facilities/widgets/dashboard/today/widget.ts',
      widgetId: 'facilities.dashboard.today',
      field: 'title',
      locale: null,
      key: 'facilities.dashboard.widgets.today.title',
    },
  ])
})

test('formatWidgetTitleFinding names the file and the key to add', () => {
  const file = 'src/modules/payments/widgets/dashboard/overdue/widget.ts'
  assert.equal(
    formatWidgetTitleFinding({
      file,
      widgetId: 'payments.dashboard.overdue',
      field: 'title',
      locale: 'pl',
      key: 'k.title',
    }),
    `${file} [widget-title] widget "payments.dashboard.overdue" has no title in i18n/pl.json (add "k.title")`,
  )
  assert.equal(
    formatWidgetTitleFinding({
      file,
      widgetId: 'payments.dashboard.overdue',
      field: 'title',
      locale: null,
      key: 'k.title',
    }),
    `${file} [widget-title] widget "payments.dashboard.overdue" has no i18n catalogs (add "k.title")`,
  )
  assert.equal(
    formatWidgetTitleFinding({ file, widgetId: null, field: 'id', locale: null, key: null }),
    `${file} [widget-title] no literal metadata id found`,
  )
})

test('every dashboard widget of the Vereino modules has its title and description in each catalog', () => {
  assert.deepEqual(checkWidgetTitles(APP_ROOT, readVereinoModuleIds()).map(formatWidgetTitleFinding), [])
})
