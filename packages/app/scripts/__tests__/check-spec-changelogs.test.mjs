// Unit tests for the spec changelog guard (one file per changelog entry, so parallel PRs never conflict).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  CUTOVER_DATE,
  changelogSection,
  checkEntry,
  checkSpec,
  checkSpecChangelogs,
  isValidDate,
  listSpecs,
  main,
  parseRoot,
} from '../../../../scripts/check-spec-changelogs.mjs'

const STEM = '2026-10-20-demo'
const POINTER = `Later changes: one file each in \`.ai/specs/changelog/${STEM}/\`.`

function specSource({ pointer = POINTER, rows = ['| 2026-10-20 | Initial draft |'], after = '' } = {}) {
  return ['# Demo', '', '## Changelog', '', pointer, '', '| Date | Change |', '|---|---|', ...rows, after].join('\n')
}

// A throwaway repository root holding the given files (relative path -> content).
function makeRepo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-changelogs-'))
  for (const [relativePath, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true })
    fs.writeFileSync(path.join(root, relativePath), content)
  }
  return root
}

test('isValidDate accepts calendar dates only', () => {
  assert.equal(isValidDate('2026-11-06'), true)
  assert.equal(isValidDate('2026-02-30'), false)
  assert.equal(isValidDate('2026-13-01'), false)
})

test('changelogSection stops at the next level-2 heading or the end of the file', () => {
  assert.equal(changelogSection('# Spec\n\n## Scope\n'), null)
  assert.deepEqual(changelogSection('## Changelog\n| a |\n## Next\n| b |'), ['| a |'])
  assert.deepEqual(changelogSection('## Changelog\n| a |\n### Sub\n| b |'), ['| a |', '### Sub', '| b |'])
})

test('listSpecs finds dated specs in the active, implemented and archive folders only', () => {
  const root = makeRepo({
    [`.ai/specs/${STEM}.md`]: '',
    '.ai/specs/README.md': '',
    '.ai/specs/SPEC-000-template.md': '',
    '.ai/specs/research/2026-10-20-notes.md': '',
    '.ai/specs/archive/2026-01-01-old.md': '',
  })
  fs.mkdirSync(path.join(root, '.ai/specs/2026-10-20-folder.md'))
  assert.deepEqual(listSpecs(root), [
    { stem: STEM, relativePath: `.ai/specs/${STEM}.md` },
    { stem: '2026-01-01-old', relativePath: '.ai/specs/archive/2026-01-01-old.md' },
  ])
})

test('checkSpec requires the section and the pointer, and rejects rows dated after the cutover', () => {
  const spec = { stem: STEM, relativePath: `.ai/specs/${STEM}.md` }
  assert.deepEqual(checkSpec(spec, '# Demo\n'), [`.ai/specs/${STEM}.md: missing the "## Changelog" section`])
  assert.deepEqual(checkSpec(spec, specSource({ rows: [`| ${CUTOVER_DATE} | last row |`] })), [])
  assert.match(checkSpec(spec, specSource({ pointer: 'nothing here' }))[0], /must point to `\.ai\/specs\/changelog\/2026-10-20-demo\/`/)
  assert.deepEqual(checkSpec(spec, specSource({ rows: ['| 2026-11-06 | too late |'] }), '2026-11-05'), [
    `.ai/specs/${STEM}.md: Changelog row dated 2026-11-06 belongs in .ai/specs/changelog/${STEM}/2026-11-06-<slug>.md`
    + ' (one file per change; the table is frozen after 2026-11-05)',
  ])
  assert.deepEqual(checkSpec(spec, specSource({ rows: ['| 2026-11-06 | ok with a later cutover |'] }), '2026-12-31'), [])
})

test('checkEntry accepts one dated row whose date matches the file name', () => {
  const at = (name) => `.ai/specs/changelog/${STEM}/${name}`
  assert.deepEqual(checkEntry(at('2026-11-06-a.md'), '2026-11-06-a.md', '| 2026-11-06 | Did a |\n'), [])
  assert.deepEqual(checkEntry(at('2026-11-06-a.md'), '2026-11-06-a.md', '| 2026-11-06 | No newline |'), [])
  assert.match(checkEntry(at('notes.md'), 'notes.md', '')[0], /file name must be/)
  assert.match(checkEntry(at('2026-02-30-a.md'), '2026-02-30-a.md', '')[0], /not a calendar date/)
  assert.match(checkEntry(at('2026-11-06-a.md'), '2026-11-06-a.md', '| 2026-11-06 | a |\n| 2026-11-06 | b |\n')[0], /exactly one line/)
  assert.match(checkEntry(at('2026-11-06-a.md'), '2026-11-06-a.md', 'just prose\n')[0], /exactly one line/)
  assert.match(checkEntry(at('2026-11-06-a.md'), '2026-11-06-a.md', '| 2026-11-06 |  |\n')[0], /exactly one line/)
  assert.match(checkEntry(at('2026-11-06-a.md'), '2026-11-06-a.md', '| 2026-11-07 | a |\n')[0], /differs from the file name date 2026-11-06/)
})

test('checkSpecChangelogs passes a repository without a changelog folder', () => {
  const root = makeRepo({ [`.ai/specs/${STEM}.md`]: specSource() })
  assert.deepEqual(checkSpecChangelogs(root), [])
})

test('checkSpecChangelogs validates every folder and entry under .ai/specs/changelog', () => {
  const root = makeRepo({
    [`.ai/specs/${STEM}.md`]: specSource({ rows: ['| 2026-11-06 | appended to the table |'] }),
    '.ai/specs/changelog/README.md': '# Spec changelog entries\n',
    '.ai/specs/changelog/stray.md': '',
    [`.ai/specs/changelog/${STEM}/2026-11-06-ok.md`]: '| 2026-11-06 | fine |\n',
    [`.ai/specs/changelog/${STEM}/2026-11-06-bad.md`]: 'prose\n',
    [`.ai/specs/changelog/${STEM}/nested/2026-11-06-x.md`]: '| 2026-11-06 | x |\n',
    '.ai/specs/changelog/2026-01-01-missing/2026-11-06-x.md': '| 2026-11-06 | x |\n',
  })
  assert.deepEqual(checkSpecChangelogs(root).sort(), [
    `.ai/specs/${STEM}.md: Changelog row dated 2026-11-06 belongs in .ai/specs/changelog/${STEM}/2026-11-06-<slug>.md`
    + ` (one file per change; the table is frozen after ${CUTOVER_DATE})`,
    '.ai/specs/changelog/2026-01-01-missing/: no spec named 2026-01-01-missing.md in .ai/specs, .ai/specs/implemented, .ai/specs/archive',
    `.ai/specs/changelog/${STEM}/2026-11-06-bad.md: must hold exactly one line "| YYYY-MM-DD | change |"`,
    `.ai/specs/changelog/${STEM}/nested: entries are files, not folders`,
    '.ai/specs/changelog/stray.md: only one folder per spec belongs here',
  ])
  assert.equal(checkSpecChangelogs(root, { cutover: '2026-12-31' }).length, 4)
})

test('parseRoot defaults to the working directory and resolves --root', () => {
  assert.equal(parseRoot([]), process.cwd())
  assert.equal(parseRoot(['--root', 'x']), path.resolve('x'))
  assert.throws(() => parseRoot(['x']), /Usage: check-spec-changelogs\.mjs/)
})

test('main reports errors with exit code 1 and success with 0', () => {
  const good = makeRepo({ [`.ai/specs/${STEM}.md`]: specSource() })
  const bad = makeRepo({ [`.ai/specs/${STEM}.md`]: '# no changelog\n' })
  const out = []
  const err = []
  const io = { log: (line) => out.push(line), logError: (line) => err.push(line) }
  assert.equal(main({ args: ['--root', good], ...io }), 0)
  assert.deepEqual(out, [`Spec changelogs are valid: ${good}`])
  assert.equal(main({ args: ['--root', bad], ...io }), 1)
  assert.deepEqual(err, [`- .ai/specs/${STEM}.md: missing the "## Changelog" section`])
})

test('the repository itself follows the convention', () => {
  const repoRoot = path.resolve(import.meta.dirname, '../../../..')
  assert.deepEqual(checkSpecChangelogs(repoRoot), [])
})
