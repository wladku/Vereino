// Unit tests for the Vereino-only Prettier runner (engineering standards ADR-017, S3.1).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { formatFiles, listVereinoFiles, runCli, vereinoFormatGlobs } from '../vereino-format.mjs'

const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vereino-format-'))
after(() => fs.rmSync(repoRoot, { recursive: true, force: true }))

const FORMATTED = "export const answer = 'yes'\n"
const UNFORMATTED = 'export const answer = "yes";\n'

function write(relative, content) {
  const absolute = path.join(repoRoot, relative)
  fs.mkdirSync(path.dirname(absolute), { recursive: true })
  fs.writeFileSync(absolute, content)
}

write('.prettierrc.json', JSON.stringify({ semi: false, singleQuote: true }))
write('packages/app/src/modules/alpha/lib/value.ts', UNFORMATTED)
write('packages/app/src/modules/alpha/i18n/en.json', '{ "alpha.title": "Alpha" }\n')
write('packages/app/src/modules/alpha/README.md', '# Alpha\n')
write('packages/app/src/modules/alpha/node_modules/dep/index.js', UNFORMATTED)
write('packages/app/src/modules/example/index.ts', UNFORMATTED)
write('packages/app/.ai/qa/tests/playwright.config.ts', UNFORMATTED)
write('packages/app/.ai/qa/tests/platform/smoke.spec.ts', FORMATTED)
write('packages/core/src/index.ts', FORMATTED)
write('scripts/verify.mjs', FORMATTED)

test('vereinoFormatGlobs lists module, package, test and tooling paths', () => {
  const globs = vereinoFormatGlobs(['alpha'])
  assert.ok(globs.includes('packages/app/src/modules/alpha/**'))
  assert.ok(globs.includes('packages/app/.ai/qa/tests/**'))
  assert.ok(globs.includes('scripts/verify.mjs'))
})

test('listVereinoFiles keeps owned code files and skips platform, dependency and non-code files', () => {
  assert.deepEqual(listVereinoFiles({ repoRoot, moduleIds: ['alpha'] }), [
    'packages/app/.ai/qa/tests/platform/smoke.spec.ts',
    'packages/app/src/modules/alpha/i18n/en.json',
    'packages/app/src/modules/alpha/lib/value.ts',
    'packages/core/src/index.ts',
    'scripts/verify.mjs',
  ])
})

test('listVereinoFiles uses the real repository by default', () => {
  assert.ok(listVereinoFiles().includes('scripts/verify.mjs'))
})

test('formatFiles in check mode reports without writing', async () => {
  const files = ['packages/app/src/modules/alpha/lib/value.ts', 'packages/core/src/index.ts']
  assert.deepEqual(await formatFiles({ files, repoRoot, check: true }), ['packages/app/src/modules/alpha/lib/value.ts'])
  assert.equal(fs.readFileSync(path.join(repoRoot, files[0]), 'utf8'), UNFORMATTED)
})

test('runCli --check fails and names unformatted files', async () => {
  const lines = []
  const problems = []
  const code = await runCli({
    argv: ['--check'],
    repoRoot,
    moduleIds: ['alpha'],
    log: (line) => lines.push(line),
    error: (line) => problems.push(line),
  })
  assert.equal(code, 1)
  assert.deepEqual(problems, [
    'format:check: packages/app/src/modules/alpha/lib/value.ts is not formatted (run yarn format)',
  ])
  assert.deepEqual(lines, ['format:check: 5 Vereino file(s), 1 unformatted'])
})

test('runCli without --check rewrites files and then passes the check', async () => {
  const lines = []
  assert.equal(await runCli({ argv: [], repoRoot, moduleIds: ['alpha'], log: (line) => lines.push(line) }), 0)
  assert.deepEqual(lines, ['format: 5 Vereino file(s), 1 reformatted'])
  assert.equal(fs.readFileSync(path.join(repoRoot, 'packages/app/src/modules/alpha/lib/value.ts'), 'utf8'), FORMATTED)
  assert.equal(await runCli({ argv: ['--check'], repoRoot, moduleIds: ['alpha'], log: () => undefined }), 0)
})

test('runCli and formatFiles fall back to the console and the repository root', async () => {
  const original = console.log
  const lines = []
  console.log = (line) => lines.push(line)
  try {
    assert.equal(await runCli({ argv: ['--check'], repoRoot, moduleIds: [] }), 0)
    assert.deepEqual(await formatFiles({ files: ['scripts/verify.mjs'], check: true }), [])
  } finally {
    console.log = original
  }
  assert.deepEqual(lines, ['format:check: 3 Vereino file(s), 0 unformatted'])
})
