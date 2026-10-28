// Unit tests for the shared lint configuration builders (engineering standards S3.10, ADR-018).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import tseslint from 'typescript-eslint'
import boundaries from 'eslint-plugin-boundaries'
import {
  FOUNDATION_PUBLIC_ENTRY,
  FRAMEWORK_FREE_IMPORT_RESTRICTIONS,
  ORM_ALLOWED_MODULE_PATHS,
  VEREINO_REACT_RULES,
  VEREINO_TYPESCRIPT_RULES,
  vereinoModuleBoundaryConfigs,
  vereinoReactConfigs,
  vereinoTypeScriptConfigs,
} from '../../../../eslint.vereino.mjs'

test('vereinoTypeScriptConfigs returns nothing without files', () => {
  assert.deepEqual(vereinoTypeScriptConfigs({ tseslint, files: [], tsconfigRootDir: '.' }), [])
})

test('vereinoTypeScriptConfigs scopes strictTypeChecked to the given files', () => {
  const files = ['src/**/*.ts']
  const configs = vereinoTypeScriptConfigs({ tseslint, files, tsconfigRootDir: '/repo' })
  assert.equal(configs.length, tseslint.configs.strictTypeChecked.length + 1)
  for (const config of configs) {
    assert.deepEqual(config.files, files)
    assert.deepEqual(config.ignores, [])
  }
  const last = configs.at(-1)
  assert.deepEqual(last.rules, VEREINO_TYPESCRIPT_RULES)
  assert.deepEqual(last.languageOptions.parserOptions, { projectService: true, tsconfigRootDir: '/repo' })
})

test('vereinoTypeScriptConfigs passes ignores through', () => {
  const configs = vereinoTypeScriptConfigs({ tseslint, files: ['a.ts'], ignores: ['b.ts'], tsconfigRootDir: '.' })
  assert.deepEqual(configs.at(-1).ignores, ['b.ts'])
})

test('module boundaries and React rules are empty without Vereino modules', () => {
  assert.deepEqual(vereinoModuleBoundaryConfigs({ boundaries, moduleIds: [] }), [])
  assert.deepEqual(vereinoReactConfigs({ moduleIds: [] }), [])
})

test('module boundaries build one policy per module', () => {
  const [boundaryConfig, ormConfig, libConfig, consoleConfig] = vereinoModuleBoundaryConfigs({
    boundaries,
    moduleIds: ['a', 'b'],
  })
  const policies = boundaryConfig.rules['boundaries/dependencies'][1].policies
  assert.equal(policies.length, 2)
  assert.deepEqual(policies[0].disallow.to.element.captured, { moduleId: '!a' })
  assert.deepEqual(policies[0].disallow.dependency, { kind: 'value' })
  assert.equal(boundaryConfig.settings['boundaries/elements'][0].pattern, FOUNDATION_PUBLIC_ENTRY)
  assert.equal(boundaryConfig.rules['no-restricted-imports'][1].patterns.length, 2)
  const libPatterns = libConfig.rules['no-restricted-imports'][1].patterns
  assert.equal(libPatterns.length, FRAMEWORK_FREE_IMPORT_RESTRICTIONS['no-restricted-imports'][1].patterns.length + 1)
  assert.deepEqual(consoleConfig.rules, { 'no-console': 'error' })
})

test('the ORM is allowed only in the persistence paths of each module', () => {
  const [, ormConfig] = vereinoModuleBoundaryConfigs({ boundaries, moduleIds: ['a'] })
  assert.deepEqual(ormConfig.files, [
    'src/modules/a/data/**/*.{ts,tsx}',
    'src/modules/a/commands/**/*.{ts,tsx}',
    'src/modules/a/services/**/*.{ts,tsx}',
    'src/modules/a/migrations/**/*.{ts,tsx}',
    'src/modules/a/setup.ts',
    'src/modules/a/di.ts',
  ])
  assert.equal(ormConfig.files.length, ORM_ALLOWED_MODULE_PATHS.length)
  assert.equal(ormConfig.rules['no-restricted-imports'][1].patterns.length, 1)
})

test('React rules re-enable the scaffold overrides for Vereino modules', () => {
  const [config] = vereinoReactConfigs({ moduleIds: ['a'] })
  assert.deepEqual(config.files, ['src/modules/a/**/*.{ts,tsx}'])
  assert.deepEqual(config.rules, VEREINO_REACT_RULES)
})
