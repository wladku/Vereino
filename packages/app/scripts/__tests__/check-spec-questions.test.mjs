// Unit tests for the spec Open Questions guard (PS-TEST-01: the *Blocking?* column names phases).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  RULE_START_DATE,
  blockingRows,
  checkSpec,
  checkSpecQuestions,
  listSpecs,
  main,
  parseBlockingValue,
  parseRoot,
  phaseNumbers,
  tableCells,
} from '../../../../scripts/check-spec-questions.mjs'

const NEW_SPEC = '.ai/specs/2026-12-01-demo.md'

function specSource(values, phases = ['### Phase 1 — First', '### Phase 2 — Second', '### Phase 4 — Fourth']) {
  return [
    '# Demo',
    '',
    '## Implementation Phases',
    ...phases,
    '',
    '## Open Questions',
    '',
    '| ID | Question | Owner | Blocking? | Resolution |',
    '|---|---|---|---|---|',
    ...values.map((value, index) => `| Q-${index + 1} | ? | owner | ${value} | pending |`),
    '',
  ].join('\n')
}

// A throwaway repository root holding the given files (relative path -> content).
function makeRepo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-questions-'))
  for (const [relativePath, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true })
    fs.writeFileSync(path.join(root, relativePath), content)
  }
  return root
}

test('tableCells splits table rows and ignores other lines', () => {
  assert.deepEqual(tableCells('| a | b c |'), ['a', 'b c'])
  assert.deepEqual(tableCells('  |---|:-:|  '), ['---', ':-:'])
  assert.equal(tableCells('text'), null)
  assert.equal(tableCells('| open'), null)
  assert.equal(tableCells('|'), null)
})

test('parseBlockingValue accepts no and phase lists only', () => {
  assert.deepEqual(parseBlockingValue('no'), [])
  assert.deepEqual(parseBlockingValue('phase 3'), [3])
  assert.deepEqual(parseBlockingValue('phases 2, 4'), [2, 4])
  assert.deepEqual(parseBlockingValue('phases 1, 2, 10'), [1, 2, 10])
  for (const value of [
    'yes',
    'yes/no',
    'Phase 1',
    'phase 1a',
    'phases 2 and 4',
    'phases 2',
    'phase',
    'no — later',
    '',
  ]) {
    assert.equal(parseBlockingValue(value), null, value)
  }
})

test('phaseNumbers reads level-3 phase headings', () => {
  assert.deepEqual([...phaseNumbers('### Phase 1 — A\n## Phase 9\n### Phase 12: B\n### Phases 3\n')], [1, 12])
})

test('blockingRows reads only tables with a Blocking? header and skips separators', () => {
  const source = [
    '| ID | Value |',
    '|---|---|',
    '| X-1 | yes |',
    '',
    '| ID | Blocking? |',
    '|:--|--:|',
    '| Q-1 | no |',
    '| Q-2 |',
    'prose',
    '| Q-3 | yes |',
  ].join('\n')
  assert.deepEqual(blockingRows(source), [
    { lineNumber: 7, id: 'Q-1', value: 'no' },
    { lineNumber: 8, id: 'Q-2', value: '' },
  ])
})

test('checkSpec accepts valid values and reports bad values and unknown phases', () => {
  assert.deepEqual(checkSpec(NEW_SPEC, specSource(['no', 'phase 1', 'phases 2, 4'])), [])
  assert.deepEqual(checkSpec(NEW_SPEC, specSource(['yes', 'phases 2, 3'])), [
    `${NEW_SPEC}:12 (Q-1): Blocking? must be \`no\`, \`phase N\` or \`phases N, M\`, not "yes"`,
    `${NEW_SPEC}:13 (Q-2): Blocking? names phase 3, but the spec has no "### Phase 3" heading`,
  ])
})

test('listSpecs takes dated specs from the start date on, in the three spec folders', () => {
  const root = makeRepo({
    [NEW_SPEC]: '',
    [`.ai/specs/${RULE_START_DATE}-first.md`]: '',
    '.ai/specs/2026-11-24-old.md': '',
    '.ai/specs/README.md': '',
    '.ai/specs/research/2026-12-01-notes.md': '',
    '.ai/specs/archive/2026-12-02-gone.md': '',
  })
  fs.mkdirSync(path.join(root, '.ai/specs/2026-12-03-folder.md'))
  assert.deepEqual(listSpecs(root), [
    `.ai/specs/${RULE_START_DATE}-first.md`,
    NEW_SPEC,
    '.ai/specs/archive/2026-12-02-gone.md',
  ])
  assert.equal(listSpecs(root, '2026-01-01').length, 4)
})

test('checkSpecQuestions checks new specs and leaves older free text alone', () => {
  const root = makeRepo({
    [NEW_SPEC]: specSource(['yes — phase 4']),
    '.ai/specs/2026-11-24-old.md': specSource(['yes — phase 4']),
  })
  assert.equal(checkSpecQuestions(root).length, 1)
  assert.equal(checkSpecQuestions(root, { startDate: '2026-01-01' }).length, 2)
})

test('parseRoot defaults to the working directory and resolves --root', () => {
  assert.equal(parseRoot([]), process.cwd())
  assert.equal(parseRoot(['--root', 'x']), path.resolve('x'))
  assert.throws(() => parseRoot(['x']), /Usage: check-spec-questions\.mjs/)
})

test('main reports errors with exit code 1 and success with 0', () => {
  const good = makeRepo({ [NEW_SPEC]: specSource(['no']) })
  const bad = makeRepo({ [NEW_SPEC]: specSource(['maybe']) })
  const out = []
  const err = []
  const io = { log: (line) => out.push(line), logError: (line) => err.push(line) }
  assert.equal(main({ args: ['--root', good], ...io }), 0)
  assert.deepEqual(out, [`Spec Open Questions are valid: ${good}`])
  assert.equal(main({ args: ['--root', bad], ...io }), 1)
  assert.deepEqual(err, [
    `- ${NEW_SPEC}:12 (Q-1): Blocking? must be \`no\`, \`phase N\` or \`phases N, M\`, not "maybe"`,
  ])
})

test('the repository itself follows the rule', () => {
  const repoRoot = path.resolve(import.meta.dirname, '../../../..')
  assert.deepEqual(checkSpecQuestions(repoRoot), [])
})
