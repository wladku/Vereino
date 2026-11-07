// Tests for the lessons guard: the records' front matter is the catalog and `.ai/lessons.md` holds no rows,
// so two branches that add or edit lessons merge into a valid catalog without anyone fixing an index by hand.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  checkLessonsCatalog,
  formatCatalogRow,
  listLessons,
  main,
  parseArgs,
  parseFrontMatter,
  readLessonRecords,
} from '../../../../scripts/check-lessons.mjs'
import { REPO_ROOT } from '../vereino-paths.mjs'

const GUIDE = fs.readFileSync(path.join(REPO_ROOT, '.ai', 'lessons.md'), 'utf8')

function lesson({
  title = 'A rule',
  modules = ['platform'],
  areas = ['testing'],
  topics = ['one', 'two'],
  h1 = title,
  body = '',
} = {}) {
  const frontMatter = [
    `title: ${JSON.stringify(title)}`,
    `modules: ${JSON.stringify(modules)}`,
    `areas: ${JSON.stringify(areas)}`,
    `topics: ${JSON.stringify(topics)}`,
  ]
  return ['---', ...frontMatter, '---', '', `# ${h1}`, '', `**Rule**: ${body || title}.`, ''].join('\n')
}

function write(root, relativePath, content) {
  fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true })
  fs.writeFileSync(path.join(root, relativePath), content)
}

// A throwaway app root holding the given files (relative path -> content).
function makeRoot(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lessons-'))
  for (const [relativePath, content] of Object.entries(files)) write(root, relativePath, content)
  return root
}

function frontMatterErrors(source) {
  const errors = []
  parseFrontMatter(source, 'x.md', errors)
  return errors
}

test('parseFrontMatter accepts a well-formed record', () => {
  const errors = []
  assert.deepEqual(parseFrontMatter(lesson(), 'x.md', errors), {
    title: 'A rule',
    modules: ['platform'],
    areas: ['testing'],
    topics: ['one', 'two'],
  })
  assert.deepEqual(errors, [])
})

test('parseFrontMatter reports every malformed field', () => {
  assert.deepEqual(frontMatterErrors('# No front matter\n'), [
    'x.md: expected JSON-valued front matter followed by one H1',
  ])
  const malformed = '---\nnot a pair\ntitle: [unclosed\n---\n\n# T\n'
  assert.ok(frontMatterErrors(malformed).includes('x.md: malformed front matter line "not a pair"'))
  assert.ok(frontMatterErrors(malformed).includes('x.md: title must use valid JSON syntax'))
  assert.ok(
    frontMatterErrors(malformed).includes('x.md: front matter keys must be exactly title, modules, areas, topics'),
  )
  assert.ok(frontMatterErrors(malformed).includes('x.md: title must be a non-empty string'))
  assert.ok(frontMatterErrors(malformed).includes('x.md: modules must contain an owning module/package or platform'))
  assert.ok(frontMatterErrors(malformed).includes('x.md: areas must contain at least one standalone router area'))
  assert.ok(frontMatterErrors(malformed).includes('x.md: topics must contain between two and six important concepts'))

  const cases = [
    [{ title: '', h1: 'Heading' }, 'x.md: title must be a non-empty string'],
    [{ h1: 'Another' }, 'x.md: front matter title must match the H1'],
    [{ modules: [] }, 'x.md: modules must contain an owning module/package or platform'],
    [{ modules: ['Club-Core'] }, 'x.md: modules must use lowercase snake_case tags'],
    [{ modules: [7] }, 'x.md: modules must use lowercase snake_case tags'],
    [{ areas: ['nowhere'] }, 'x.md: areas contain a value outside the standalone router taxonomy'],
    [{ topics: ['one'] }, 'x.md: topics must contain between two and six important concepts'],
    [
      { topics: ['1', '2', '3', '4', '5', '6', '7'] },
      'x.md: topics must contain between two and six important concepts',
    ],
    [{ topics: ['one', 'Two'] }, 'x.md: topics must use lowercase kebab-case tags'],
    [{ topics: ['one', 2] }, 'x.md: topics must use lowercase kebab-case tags'],
    [{ topics: ['one', 'one'] }, 'x.md: topics must not contain duplicates'],
  ]
  for (const [overrides, expected] of cases)
    assert.deepEqual(frontMatterErrors(lesson(overrides)), [expected], expected)
})

test('readLessonRecords skips the template, sub-folders and other files, and rejects bad names and duplicate titles', () => {
  assert.deepEqual(readLessonRecords(makeRoot({})), { records: [], errors: [] })
  const root = makeRoot({
    '.ai/lessons/_template.md': 'anything',
    '.ai/lessons/notes.txt': 'anything',
    '.ai/lessons/nested/inner.md': 'anything',
    '.ai/lessons/b-rule.md': lesson({ title: 'B rule' }),
    '.ai/lessons/a-rule.md': lesson({ title: 'A rule' }),
    '.ai/lessons/copy-of-a.md': lesson({ title: 'A rule' }),
    '.ai/lessons/Bad_Name.md': lesson({ title: 'Badly named' }),
    '.ai/lessons/broken.md': '# no front matter\n',
  })
  const { records, errors } = readLessonRecords(root)
  assert.deepEqual(
    records.map((record) => record.fileName),
    ['a-rule.md', 'b-rule.md'],
  )
  assert.deepEqual(errors, [
    '.ai/lessons/Bad_Name.md: filename must use kebab-case',
    '.ai/lessons/broken.md: expected JSON-valued front matter followed by one H1',
    '.ai/lessons/copy-of-a.md: duplicate lesson title "A rule"',
  ])
})

test('listLessons prints one row per record, filtered by every term', () => {
  const root = makeRoot({
    '.ai/lessons/a-rule.md': lesson({ title: 'A rule', modules: ['club_core'], areas: ['testing', 'debugging'] }),
    '.ai/lessons/b-rule.md': lesson({ title: 'B rule', topics: ['merge', 'git'] }),
  })
  assert.deepEqual(listLessons(root), [
    '- [A rule](lessons/a-rule.md) — area:testing,debugging; module:club_core; topic:one,two',
    '- [B rule](lessons/b-rule.md) — area:testing; module:platform; topic:merge,git',
  ])
  assert.deepEqual(listLessons(root, ['CLUB_CORE', 'debugging']), [listLessons(root)[0]])
  assert.deepEqual(listLessons(root, ['club_core', 'git']), [])
  assert.equal(formatCatalogRow(readLessonRecords(root).records[1]), listLessons(root)[1])
})

test('checkLessonsCatalog requires the guide and rejects catalog rows and lesson prose in it', () => {
  const missing = makeRoot({})
  assert.deepEqual(checkLessonsCatalog(missing), [
    `${path.join(missing, '.ai', 'lessons.md')}: lessons guide is missing`,
  ])
  assert.deepEqual(checkLessonsCatalog(makeRoot({ '.ai/lessons.md': GUIDE, '.ai/lessons/a.md': lesson() })), [])
  const withRow = makeRoot({
    '.ai/lessons.md': `${GUIDE}\n- [A rule](lessons/a.md) — area:testing; module:platform; topic:one,two\n`,
    '.ai/lessons/a.md': lesson({ topics: ['one'] }),
  })
  assert.deepEqual(checkLessonsCatalog(withRow), [
    '.ai/lessons/a.md: topics must contain between two and six important concepts',
    '.ai/lessons.md: must not hold catalog rows (a shared index breaks merges); the front matter of .ai/lessons/*.md' +
      ' is the catalog, printed by `yarn lessons:list`. Keep your record and restore the guide:' +
      ' git checkout origin/main -- .ai/lessons.md',
  ])
  assert.deepEqual(checkLessonsCatalog(makeRoot({ '.ai/lessons.md': `${GUIDE}\n**Rule**: prose.\n` })), [
    '.ai/lessons.md: full lesson prose belongs in .ai/lessons/, not the guide',
  ])
})

test('the repository catalog is valid', () => {
  assert.deepEqual(checkLessonsCatalog(REPO_ROOT), [])
  assert.ok(listLessons(REPO_ROOT).length > 0)
})

test('parseArgs reads --root, --list and search terms', () => {
  assert.deepEqual(parseArgs([]), { rootDir: process.cwd(), list: false, terms: [] })
  assert.deepEqual(parseArgs(['--root', 'x', '--list', 'a', 'b']), {
    rootDir: path.resolve('x'),
    list: true,
    terms: ['a', 'b'],
  })
  assert.throws(() => parseArgs(['--root']), /Usage/)
  assert.throws(() => parseArgs(['term']), /Usage/)
  assert.throws(() => parseArgs(['--list', '--other']), /Usage/)
})

test('main validates or lists, with exit code 1 on errors and on an empty listing', () => {
  const lines = []
  const io = { log: (line) => lines.push(['log', line]), logError: (line) => lines.push(['error', line]) }
  const good = makeRoot({ '.ai/lessons.md': GUIDE, '.ai/lessons/a.md': lesson() })
  const bad = makeRoot({ '.ai/lessons.md': GUIDE, '.ai/lessons/a.md': lesson({ areas: [] }) })
  assert.equal(main({ args: ['--root', good], ...io }), 0)
  assert.equal(main({ args: ['--root', bad], ...io }), 1)
  assert.equal(main({ args: ['--root', good, '--list', 'testing'], ...io }), 0)
  assert.equal(main({ args: ['--root', good, '--list', 'absent'], ...io }), 1)
  assert.deepEqual(lines, [
    ['log', `Lessons catalog is valid: ${good}`],
    ['error', '- .ai/lessons/a.md: areas must contain at least one standalone router area'],
    ['log', '- [A rule](lessons/a.md) — area:testing; module:platform; topic:one,two'],
    ['error', 'No lesson matches absent'],
  ])
})

// The scenario that broke `lessons:check` three times on 2026-11-06, now in a real repository: two branches each
// edit one existing lesson and add a new one; both merge into main (in both orders), and the catalog stays valid.
function git(cwd, ...args) {
  return execFileSync(
    'git',
    [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      '-c',
      'commit.gpgsign=false',
      '-c',
      'core.autocrlf=false',
      ...args,
    ],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
}

function commitFiles(root, files, message) {
  for (const [relativePath, content] of Object.entries(files)) write(root, relativePath, content)
  git(root, 'add', '--all')
  git(root, 'commit', '--quiet', '-m', message)
}

test('two branches that edit and add lessons merge cleanly into a valid catalog', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lessons-merge-'))
  git(root, 'init', '--quiet', '--initial-branch=main')
  commitFiles(
    root,
    {
      '.gitattributes': fs.readFileSync(path.join(REPO_ROOT, '.gitattributes'), 'utf8'),
      '.ai/lessons.md': GUIDE,
      '.ai/lessons/shared-rule.md': lesson({ title: 'Shared rule', topics: ['merge', 'git'] }),
      '.ai/lessons/other-rule.md': lesson({ title: 'Other rule', topics: ['merge', 'ci'] }),
    },
    'base',
  )

  git(root, 'switch', '--quiet', '-c', 'pr-a')
  commitFiles(
    root,
    {
      '.ai/lessons/shared-rule.md': lesson({ title: 'Shared rule, renamed by A', topics: ['merge', 'git', 'union'] }),
      '.ai/lessons/added-by-a.md': lesson({ title: 'Added by A', modules: ['club_core'] }),
    },
    'pr a',
  )
  git(root, 'switch', '--quiet', 'main')
  git(root, 'switch', '--quiet', '-c', 'pr-b')
  commitFiles(
    root,
    {
      '.ai/lessons/other-rule.md': lesson({ title: 'Other rule, renamed by B', topics: ['merge', 'ci', 'queue'] }),
      '.ai/lessons/added-by-b.md': lesson({ title: 'Added by B', areas: ['ai-workflow'] }),
    },
    'pr b',
  )

  // GitHub's mergeability check and merge button do not run merge drivers; a server-side merge must be clean too.
  git(root, 'merge-tree', '--write-tree', 'pr-a', 'pr-b')

  const expected = [
    '- [Added by A](lessons/added-by-a.md) — area:testing; module:club_core; topic:one,two',
    '- [Added by B](lessons/added-by-b.md) — area:ai-workflow; module:platform; topic:one,two',
    '- [Other rule, renamed by B](lessons/other-rule.md) — area:testing; module:platform; topic:merge,ci,queue',
    '- [Shared rule, renamed by A](lessons/shared-rule.md) — area:testing; module:platform; topic:merge,git,union',
  ]
  for (const [first, second] of [
    ['pr-a', 'pr-b'],
    ['pr-b', 'pr-a'],
  ]) {
    git(root, 'switch', '--quiet', '-C', `merged-${first}`, 'main')
    git(root, 'merge', '--quiet', '--no-edit', first)
    git(root, 'merge', '--quiet', '--no-edit', second)
    assert.equal(git(root, 'status', '--porcelain'), '')
    assert.deepEqual(checkLessonsCatalog(root), [])
    assert.deepEqual(listLessons(root), expected)
    assert.equal(fs.readFileSync(path.join(root, '.ai', 'lessons.md'), 'utf8'), GUIDE)
  }
})
