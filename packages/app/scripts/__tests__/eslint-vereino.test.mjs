// Unit tests for the shared lint configuration builders (engineering standards S3.10, ADR-018).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import tseslint from 'typescript-eslint'
import boundaries from 'eslint-plugin-boundaries'
import { Linter } from 'eslint'
import {
  DIALOG_CONTENT_RESTRICTIONS,
  FOUNDATION_PUBLIC_ENTRY,
  FRAMEWORK_FREE_IMPORT_RESTRICTIONS,
  MODULE_CLI_EXIT_CODE_RESTRICTIONS,
  ORM_ALLOWED_MODULE_PATHS,
  STATUS_PILL_RESTRICTIONS,
  VEREINO_REACT_RULES,
  VEREINO_TYPESCRIPT_RULES,
  vereinoModuleBoundaryConfigs,
  vereinoModuleCliConfigs,
  vereinoReactConfigs,
  vereinoStatusPillConfigs,
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
  assert.equal(boundaryConfig.rules['no-restricted-imports'][1].paths, DIALOG_CONTENT_RESTRICTIONS)
  assert.equal(ormConfig.rules['no-restricted-imports'][1].paths, DIALOG_CONTENT_RESTRICTIONS)
  assert.deepEqual(
    DIALOG_CONTENT_RESTRICTIONS.map((restriction) => [restriction.name, restriction.importNames]),
    [
      ['@open-mercato/ui/primitives/dialog', ['DialogContent']],
      ['@open-mercato/ui/primitives/sheet', ['SheetContent']],
    ],
  )
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

test('the status-pill rule is empty without files and scoped to the given files', () => {
  assert.deepEqual(vereinoStatusPillConfigs({ files: [] }), [])
  const [config] = vereinoStatusPillConfigs({ files: ['src/**/*.tsx'] })
  assert.deepEqual(config.files, ['src/**/*.tsx'])
  assert.deepEqual(config.ignores, [])
  assert.equal(config.rules, STATUS_PILL_RESTRICTIONS)
  assert.deepEqual(vereinoStatusPillConfigs({ files: ['a.tsx'], ignores: ['b.tsx'] })[0].ignores, ['b.tsx'])
})

// #482: a bare status pill fails lint (and so `yarn verify`) with the file and line; `StatusTag`, type imports and
// category tags pass.
const lintStatusPills = (code) =>
  new Linter({ configType: 'flat' }).verify(
    code,
    [
      {
        files: ['**/*.tsx'],
        languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
        rules: STATUS_PILL_RESTRICTIONS,
      },
    ],
    'src/modules/payments/components/Bad.tsx',
  )

test('the status-pill rule rejects StatusBadge and Tag or Badge with a literal status tone', () => {
  const messages = lintStatusPills(
    [
      "import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'",
      "import { Tag } from '@open-mercato/ui/primitives/tag'",
      "import { Badge } from '@open-mercato/ui/primitives/badge'",
      'export const A = () => <StatusBadge variant="error">Overdue</StatusBadge>',
      'export const B = () => <Tag variant="warning">Due soon</Tag>',
      'export const C = () => <Badge variant="success">Paid</Badge>',
    ].join('\n'),
  )
  assert.deepEqual(
    messages.map((message) => [message.ruleId, message.line]),
    [
      ['no-restricted-syntax', 1],
      ['no-restricted-syntax', 5],
      ['no-restricted-syntax', 6],
    ],
  )
  assert.match(messages[0].message, /use `StatusTag` from `@vereino\/ui`/)
})

test('the status-pill rule allows StatusTag, type imports and category tags', () => {
  const messages = lintStatusPills(
    [
      "import type { StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'",
      "import { Tag } from '@open-mercato/ui/primitives/tag'",
      "import { StatusTag } from '@vereino/ui'",
      "const KIND: Record<string, 'info'> = { class: 'info' }",
      "export const tone: StatusBadgeVariant = 'error'",
      'export const A = () => <StatusTag status="canceled">Cancelled</StatusTag>',
      'export const B = () => <Tag variant={KIND.class}>Class</Tag>',
      'export const C = () => <Tag>Filter</Tag>',
    ].join('\n'),
  )
  assert.deepEqual(messages, [])
})

test('the module CLI exit-code rule is empty without modules and scoped to each cli.ts', () => {
  assert.deepEqual(vereinoModuleCliConfigs({ moduleIds: [] }), [])
  const [config] = vereinoModuleCliConfigs({ moduleIds: ['a', 'b'] })
  assert.deepEqual(config.files, ['src/modules/a/cli.ts', 'src/modules/b/cli.ts'])
  assert.equal(config.rules, MODULE_CLI_EXIT_CODE_RESTRICTIONS)
})

// #642: `mercato` exits 0 after a command that set `process.exitCode`, so a module CLI fails by throwing.
test('the module CLI exit-code rule rejects process.exitCode assignments and allows reads and throws', () => {
  const messages = new Linter({ configType: 'flat' }).verify(
    [
      'export async function run(ok: boolean) {',
      '  if (!ok) process.exitCode = 1',
      '  process.exitCode ??= 2',
      '  const code = process.exitCode',
      "  if (code) throw new Error('[internal] people sync-role-expiry: invalid options')",
      '}',
    ].join('\n'),
    [{ files: ['**/*.ts'], languageOptions: { parser: tseslint.parser }, rules: MODULE_CLI_EXIT_CODE_RESTRICTIONS }],
    'src/modules/people/cli.ts',
  )
  assert.deepEqual(
    messages.map((message) => [message.ruleId, message.line]),
    [
      ['no-restricted-syntax', 2],
      ['no-restricted-syntax', 3],
    ],
  )
  assert.match(messages[0].message, /throw new Error/)
})
