// Unit tests for the Vereino path helpers (engineering standards S3.1).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { APP_ROOT, PLATFORM_MODULE_IDS, REPO_ROOT, readVereinoModuleIds, vereinoAppGlobs } from '../vereino-paths.mjs'

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vereino-paths-'))
after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }))

function appRootWith(content) {
  const dir = fs.mkdtempSync(path.join(fixtureRoot, 'app-'))
  fs.writeFileSync(path.join(dir, 'vereino-modules.json'), JSON.stringify(content))
  return dir
}

test('APP_ROOT and REPO_ROOT point at packages/app and the repository root', () => {
  assert.ok(fs.existsSync(path.join(APP_ROOT, 'vereino-modules.json')))
  assert.equal(path.resolve(APP_ROOT, '..', '..'), REPO_ROOT)
})

test('readVereinoModuleIds returns the listed module ids', () => {
  assert.deepEqual(readVereinoModuleIds(appRootWith({ modules: ['club_core', 'people'] })), ['club_core', 'people'])
})

test('readVereinoModuleIds reads the repository list by default', () => {
  assert.ok(Array.isArray(readVereinoModuleIds()))
})

test('readVereinoModuleIds rejects a missing modules array', () => {
  assert.throws(() => readVereinoModuleIds(appRootWith({ modules: 'people' })), /"modules" must be an array/)
})

test('readVereinoModuleIds rejects ids that are not snake_case strings', () => {
  assert.throws(() => readVereinoModuleIds(appRootWith({ modules: ['People'] })), /invalid module id "People"/)
  assert.throws(() => readVereinoModuleIds(appRootWith({ modules: [7] })), /invalid module id 7/)
})

test('readVereinoModuleIds rejects platform scaffold modules', () => {
  for (const id of PLATFORM_MODULE_IDS) {
    assert.throws(() => readVereinoModuleIds(appRootWith({ modules: [id] })), /is a platform scaffold module/)
  }
})

test('vereinoAppGlobs covers each module and the integration tests', () => {
  assert.deepEqual(vereinoAppGlobs(['people']), ['src/modules/people/**', '.ai/qa/tests/**'])
  assert.ok(vereinoAppGlobs().includes('.ai/qa/tests/**'))
})
