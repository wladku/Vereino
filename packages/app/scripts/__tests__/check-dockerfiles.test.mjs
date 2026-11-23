// Unit tests for the Dockerfile guard `scripts/check-dockerfiles.mjs` (engineering standards S14.8; issue #463).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  checkDockerfile,
  checkRepository,
  DOCKERFILES,
  isRootUser,
  parseFrom,
  parseInstructions,
  runCli,
} from '../../../../scripts/check-dockerfiles.mjs'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const DIGEST = `sha256:${'a'.repeat(64)}`
const PINNED = `node:24-alpine@${DIGEST}`

function tempRepo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-dockerfiles-'))
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
    fs.writeFileSync(path.join(dir, name), content)
  }
  return dir
}

const GOOD = `FROM ${PINNED} AS builder\nRUN build\n\nFROM ${PINNED} AS runner\nCOPY --from=builder /a /a\nUSER node\nCMD ["x"]\n`

test('the repository Dockerfiles pass (pinned bases, non-root final stages)', () => {
  assert.deepEqual(checkRepository(REPO_ROOT), [])
})

test('parseInstructions joins continuations and drops comments and blank lines', () => {
  const source = '# header\r\n\r\nFROM a AS b\nRUN one \\\n  # inside\n  two\nrun lower\n\\\n\nUSER x'
  assert.deepEqual(parseInstructions(source), [
    { line: 3, instruction: 'FROM', args: 'a AS b' },
    { line: 4, instruction: 'RUN', args: 'one  two' },
    { line: 7, instruction: 'RUN', args: 'lower' },
    { line: 10, instruction: 'USER', args: 'x' },
  ])
})

test('parseFrom reads the image and the stage name, skipping flags', () => {
  assert.deepEqual(parseFrom(`--platform=linux/amd64 ${PINNED} as Runner`), { image: PINNED, stage: 'runner' })
  assert.deepEqual(parseFrom('node:24'), { image: 'node:24', stage: null })
  assert.deepEqual(parseFrom('node:24 AS'), { image: 'node:24', stage: '' })
  assert.deepEqual(parseFrom(''), { image: '', stage: null })
  assert.deepEqual(parseFrom('--platform=linux/amd64'), { image: '', stage: null })
})

test('isRootUser recognises root by name or uid, with or without a group', () => {
  for (const user of ['root', '0', 'root:root', '0:0', ' ', ':node']) assert.equal(isRootUser(user), true, user)
  for (const user of ['node', 'omuser', '1001', '1001:1001']) assert.equal(isRootUser(user), false, user)
})

test('a pinned multi-stage Dockerfile with a non-root final stage passes', () => {
  assert.deepEqual(checkDockerfile('Dockerfile', GOOD), [])
  assert.deepEqual(checkDockerfile('Dockerfile', `FROM ${PINNED} AS base\nFROM BASE\nUSER 1001\n`), [])
  assert.deepEqual(checkDockerfile('Dockerfile', 'FROM scratch\nUSER 65534\n'), [])
})

test('a base image by tag only, or through a build argument, fails', () => {
  assert.deepEqual(checkDockerfile('Dockerfile', 'FROM node:24-alpine AS builder\nUSER node\n'), [
    'Dockerfile:1: base image "node:24-alpine" is not pinned by digest (use <image>:<tag>@sha256:<digest>)',
  ])
  assert.equal(checkDockerfile('Dockerfile', 'ARG BASE\nFROM ${BASE}\nUSER node\n').length, 1)
  assert.equal(checkDockerfile('Dockerfile', `FROM node@sha256:short\nUSER node\n`).length, 1)
})

test('a final stage switched to root fails (negative case of the acceptance criteria)', () => {
  assert.deepEqual(checkDockerfile('Dockerfile', GOOD.replace('USER node', 'USER root')), [
    'Dockerfile: the final stage runs as root (USER root)',
  ])
  assert.deepEqual(checkDockerfile('Dockerfile', `${GOOD}USER 0\n`), [
    'Dockerfile: the final stage runs as root (USER 0)',
  ])
})

test('a final stage without USER fails even when an earlier stage set one', () => {
  assert.deepEqual(checkDockerfile('Dockerfile', `FROM ${PINNED} AS a\nUSER node\nFROM ${PINNED} AS b\nCMD ["x"]\n`), [
    'Dockerfile:3: the final stage sets no USER, so the image runs as root',
  ])
})

test('a file without FROM fails', () => {
  assert.deepEqual(checkDockerfile('Dockerfile', '# nothing\n'), ['Dockerfile: no FROM instruction'])
})

test('checkRepository reports a missing file and checks the listed ones', () => {
  const dir = tempRepo({ Dockerfile: GOOD.replace('USER node', 'USER root') })
  assert.deepEqual(checkRepository(dir, ['Dockerfile', 'docker/missing/Dockerfile']), [
    'Dockerfile: the final stage runs as root (USER root)',
    'docker/missing/Dockerfile: file not found',
  ])
  assert.deepEqual(DOCKERFILES, ['Dockerfile', 'docker/backup/Dockerfile'])
})

test('runCli exits 0 for a clean repository given by --root', () => {
  const dir = tempRepo({ Dockerfile: GOOD, 'docker/backup/Dockerfile': GOOD })
  const lines = []
  assert.equal(runCli({ argv: ['--root', dir], log: (line) => lines.push(line), error: () => {} }), 0)
  assert.match(lines[0], /2 Dockerfile\(s\) pinned by digest/)
})

test('runCli exits 1 listing every problem, reading the working directory without --root', () => {
  const dir = tempRepo({ Dockerfile: GOOD.replace('USER node', 'USER root') })
  const errors = []
  assert.equal(runCli({ argv: ['--root'], cwd: dir, log: () => {}, error: (line) => errors.push(line) }), 1)
  assert.deepEqual(errors, [
    'Dockerfile: the final stage runs as root (USER root)',
    'docker/backup/Dockerfile: file not found',
    'dockerfiles:check: 2 problem(s)',
  ])
})

test('runCli defaults to the process arguments, working directory and console', (t) => {
  const logged = t.mock.method(console, 'log', () => {})
  const errored = t.mock.method(console, 'error', () => {})
  const savedArgv = process.argv
  t.after(() => {
    process.argv = savedArgv
  })
  process.argv = ['node', 'check-dockerfiles.mjs', '--root', REPO_ROOT]
  assert.equal(runCli(), 0)
  assert.equal(logged.mock.callCount(), 1)
  const dir = tempRepo({})
  process.argv = ['node', 'check-dockerfiles.mjs', '--root', dir]
  assert.equal(runCli(), 1)
  assert.ok(errored.mock.callCount() > 0)
})
