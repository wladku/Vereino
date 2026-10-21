// ENG-TEST-04 — the error-code registry and catalog parity checks (engineering standards S2.5, S6.7).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { RESERVED_PLATFORM_CODES, checkContracts, runCli } from '../check-vereino-contracts.mjs'

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vereino-contracts-'))
after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }))

function writeModule(moduleId, { en, pl, errorCodesSource }) {
  const moduleDir = path.join(fixtureRoot, 'src', 'modules', moduleId)
  fs.mkdirSync(path.join(moduleDir, 'i18n'), { recursive: true })
  if (en) fs.writeFileSync(path.join(moduleDir, 'i18n', 'en.json'), JSON.stringify(en))
  if (pl) fs.writeFileSync(path.join(moduleDir, 'i18n', 'pl.json'), JSON.stringify(pl))
  if (errorCodesSource) {
    fs.mkdirSync(path.join(moduleDir, 'lib'), { recursive: true })
    fs.writeFileSync(path.join(moduleDir, 'lib', 'error-codes.ts'), errorCodesSource)
  }
}

const exportCodes = (codes) => `export const errorCodes = ${JSON.stringify(codes)} as const\n`

writeModule('alpha', {
  en: { alpha: { errors: { closed: 'Closed' }, title: 'Alpha', tags: ['a'], empty: null } },
  pl: { 'alpha.errors.closed': 'Zamknięte', 'alpha.title': 'Alfa', 'alpha.tags': ['a'], 'alpha.empty': null },
  errorCodesSource: exportCodes([{ code: 'declaration_closed', status: 409, messageKey: 'alpha.errors.closed' }]),
})
writeModule('beta', {
  en: { 'beta.errors.closed': 'Closed', 'beta.only.english': 'Only English' },
  pl: { 'beta.errors.closed': 'Zamknięte', 'beta.only.polish': 'Tylko polski' },
  errorCodesSource: exportCodes([
    { code: 'declaration_closed', status: 409, messageKey: 'beta.errors.closed' },
    { code: 'optimistic_lock_conflict', status: 409, messageKey: 'beta.errors.closed' },
    { code: 'BadCode', status: 409, messageKey: 'beta.errors.closed' },
    { code: 'beta_missing_message', status: 422, messageKey: 'beta.errors.missing' },
    { code: 'beta_wrong_status', status: 200, messageKey: 'beta.errors.closed' },
    { code: 'beta_server_status', status: 600, messageKey: 'beta.errors.closed' },
    { code: 'beta_text_status', status: '409', messageKey: 'beta.errors.closed' },
    { code: 'beta_foreign_key', status: 409, messageKey: 'alpha.errors.closed' },
    { code: 'beta_no_key', status: 409 },
    { status: 409, messageKey: 'beta.errors.closed' },
    null,
  ]),
})
writeModule('gamma', {
  en: { 'gamma.title': 'Gamma' },
  errorCodesSource: exportCodes([{ code: 'gamma_closed', status: 409, messageKey: 'gamma.errors.closed' }]),
})
writeModule('delta', {
  en: { 'delta.title': 'Delta' },
  pl: { 'delta.title': 'Delta' },
  errorCodesSource: 'export const errorCodes = { code: "not_an_array" }\n',
})
writeModule('epsilon', {
  en: { 'epsilon.title': 'Epsilon' },
  pl: { 'epsilon.title': 'Epsilon' },
  errorCodesSource: 'throw "loading failed"\n',
})
writeModule('zeta', { en: { 'zeta.title': 'Zeta' }, pl: { 'zeta.title': 'Zeta' } })

test('ENG-TEST-04 a valid module passes, nested catalogs are flattened', async () => {
  const result = await checkContracts({ appRoot: fixtureRoot, moduleIds: ['alpha', 'zeta'] })
  assert.deepEqual(result, { modulesChecked: 2, errorCodes: 1, errors: [] })
})

test('ENG-TEST-04 duplicate, reserved, malformed and unknown-key codes fail', async () => {
  const { errors } = await checkContracts({ appRoot: fixtureRoot, moduleIds: ['alpha', 'beta'] })
  assert.deepEqual(errors, [
    'beta: key beta.only.english is in en.json but not in pl.json',
    'beta: key beta.only.polish is in pl.json but not in en.json',
    'beta: error code declaration_closed is already declared by alpha',
    'beta: error code optimistic_lock_conflict is reserved by the platform',
    'beta: error code "BadCode" is not lower snake_case',
    'beta: message key beta.errors.missing of error code beta_missing_message is missing in en.json',
    'beta: message key beta.errors.missing of error code beta_missing_message is missing in pl.json',
    'beta: error code beta_wrong_status has invalid HTTP status 200',
    'beta: error code beta_server_status has invalid HTTP status 600',
    'beta: error code beta_text_status has invalid HTTP status "409"',
    'beta: error code beta_foreign_key needs a messageKey starting with "beta."',
    'beta: error code beta_no_key needs a messageKey starting with "beta."',
    'beta: error code undefined is not lower snake_case',
    'beta: error code undefined is not lower snake_case',
  ])
})

test('ENG-TEST-04 a missing catalog is reported and skips the key lookup for that locale', async () => {
  const { errors } = await checkContracts({ appRoot: fixtureRoot, moduleIds: ['gamma'] })
  assert.deepEqual(errors, [
    'gamma: missing i18n/pl.json',
    'gamma: message key gamma.errors.closed of error code gamma_closed is missing in en.json',
  ])
})

test('ENG-TEST-04 an error-code file must export an array and load cleanly', async () => {
  const { errors } = await checkContracts({ appRoot: fixtureRoot, moduleIds: ['delta', 'epsilon'] })
  assert.deepEqual(errors, [
    'delta: src/modules/delta/lib/error-codes.ts: must export an array named errorCodes',
    'epsilon: loading failed',
  ])
})

test('ENG-TEST-04 the reserved list names the platform codes', () => {
  assert.ok(RESERVED_PLATFORM_CODES.includes('optimistic_lock_conflict'))
})

test('checkContracts defaults to the repository module list', async () => {
  const result = await checkContracts()
  assert.equal(typeof result.modulesChecked, 'number')
})

test('runCli prints a summary and returns 1 when problems exist', async () => {
  const lines = []
  const problems = []
  const code = await runCli({
    argv: [],
    appRoot: fixtureRoot,
    moduleIds: ['gamma'],
    log: (line) => lines.push(line),
    error: (line) => problems.push(line),
  })
  assert.equal(code, 1)
  assert.deepEqual(problems, [
    'contracts:check: gamma: missing i18n/pl.json',
    'contracts:check: gamma: message key gamma.errors.closed of error code gamma_closed is missing in en.json',
  ])
  assert.deepEqual(lines, ['contracts:check: 1 Vereino module(s), 1 error code(s), 2 problem(s)'])
})

test('runCli prints JSON with --json and returns 0 when clean', async () => {
  const lines = []
  const code = await runCli({
    argv: ['--json'],
    appRoot: fixtureRoot,
    moduleIds: ['zeta'],
    log: (line) => lines.push(line),
  })
  assert.equal(code, 0)
  assert.deepEqual(JSON.parse(lines[0]), { modulesChecked: 1, errorCodes: 0, errors: [] })
})

test('runCli uses the console by default', async () => {
  const original = console.log
  const lines = []
  console.log = (line) => lines.push(line)
  try {
    assert.equal(await runCli({ argv: [], appRoot: fixtureRoot, moduleIds: [] }), 0)
  } finally {
    console.log = original
  }
  assert.deepEqual(lines, ['contracts:check: 0 Vereino module(s), 0 error code(s), 0 problem(s)'])
})
