import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { changedPaths, codeChanged, isDocsPath, main } from '../../../../scripts/ci-changes.mjs'

describe('isDocsPath', () => {
  it('treats Markdown anywhere and the documentation directories as docs', () => {
    for (const file of [
      'README.md',
      'SDLC.md',
      'packages/app/src/modules/payments/README.md',
      '.ai/skills/om-auto-fix-issue/SKILL.md',
      'docs/ops/github-settings.md',
      'docs/ux-concept/b-20.png',
      '.ai/specs/2026-10-21-engineering-standards-and-patterns.md',
      '.ai/specs/research/decisions/D-034.md',
      '.ai/runs/2026-11-25-issue-777.md',
      '.ai/lessons/some-lesson.md',
      '.ai/decisions/x.yaml',
      '.ai/qa/scenarios/2026-11-25.html',
      'NOTES.MD',
    ]) {
      assert.equal(isDocsPath(file), true, file)
    }
  })

  it('treats integration tests, CI, scripts and the harness as code even when they are Markdown', () => {
    for (const file of [
      'packages/app/.ai/qa/tests/README.md',
      'packages/app/.ai/qa/tests/payments/TEST-018.spec.ts',
      '.github/pull_request_template.md',
      '.github/workflows/ci.yml',
      'scripts/README.md',
      'scripts/ci-changes.mjs',
      '.ai/harness/cases/x.md',
    ]) {
      assert.equal(isDocsPath(file), false, file)
    }
  })

  it('treats source, config and lockfiles as code', () => {
    for (const file of [
      'packages/app/src/modules.ts',
      'package.json',
      'yarn.lock',
      '.ai/agentic.config.json',
      'Dockerfile',
    ]) {
      assert.equal(isDocsPath(file), false, file)
    }
  })
})

describe('codeChanged', () => {
  it('is false when every changed path is documentation', () => {
    assert.equal(codeChanged(['SDLC.md', '.ai/runs/x.md', ' docs/ops/a.md ', '']), false)
  })

  it('is true when one path is code', () => {
    assert.equal(codeChanged(['SDLC.md', 'packages/app/src/modules.ts']), true)
  })

  it('is true for an empty diff, so a doubtful run tests everything', () => {
    assert.equal(codeChanged([]), true)
    assert.equal(codeChanged(['', '  ']), true)
  })
})

describe('changedPaths', () => {
  it('asks git for the three-dot diff with renames split into both sides', () => {
    const calls = []
    const run = (command, args, options) => {
      calls.push({ command, args, options })
      return 'a.md\nb.ts\n'
    }
    assert.deepEqual(changedPaths('base1', 'head1', run), ['a.md', 'b.ts', ''])
    assert.deepEqual(calls, [
      { command: 'git', args: ['diff', '--name-only', '--no-renames', 'base1...head1'], options: { encoding: 'utf8' } },
    ])
  })
})

describe('main', () => {
  const quiet = () => {}

  it('appends code=false to the output file for a docs-only diff', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ci-changes-'))
    try {
      const outputFile = path.join(dir, 'output')
      const logged = []
      const code = main(['b', 'h'], {
        run: () => 'SDLC.md\ndocs/ops/github-settings.md\n',
        outputFile,
        log: (line) => logged.push(line),
      })
      assert.equal(code, false)
      assert.equal(readFileSync(outputFile, 'utf8'), 'code=false\n')
      assert.match(logged[0], /^2 changed path\(s\); docs only/)
      assert.equal(logged[1], '  docs  SDLC.md')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('prints code=true when there is no output file and code changed', () => {
    const logged = []
    const code = main(['b', 'h'], {
      run: () => 'SDLC.md\nscripts/x.mjs\n',
      outputFile: '',
      log: (line) => logged.push(line),
    })
    assert.equal(code, true)
    assert.match(logged[0], /code changed: the full suite runs/)
    assert.equal(logged[2], '  code  scripts/x.mjs')
    assert.equal(logged.at(-1), 'code=true')
  })

  it('defaults to git and $GITHUB_OUTPUT', () => {
    const saved = process.env.GITHUB_OUTPUT
    delete process.env.GITHUB_OUTPUT
    const savedLog = console.log
    const logged = []
    console.log = (line) => logged.push(line)
    try {
      // HEAD...HEAD is an empty diff in any checkout, which counts as code.
      assert.equal(main(['HEAD', 'HEAD']), true)
      assert.equal(logged.at(-1), 'code=true')
    } finally {
      console.log = savedLog
      if (saved !== undefined) process.env.GITHUB_OUTPUT = saved
    }
  })

  it('refuses to run without a base and a head', () => {
    assert.throws(() => main(['only-base'], { run: quiet, log: quiet }), /usage/)
    assert.throws(() => main([], { run: quiet, log: quiet }), /usage/)
  })
})
