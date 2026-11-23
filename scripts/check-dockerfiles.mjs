#!/usr/bin/env node
// Dockerfile guard for the deployed images (engineering standards S14.8, ENG-08; issue #463).
//
//   node scripts/check-dockerfiles.mjs [--root <repo-root>]
//
// For every Dockerfile in DOCKERFILES it fails when
//   - a `FROM` names an image that is not pinned by digest (`image:tag@sha256:<64 hex>`; Renovate's `docker:pinDigests`
//     keeps the tag and moves the digest), unless it names an earlier build stage or `scratch`;
//   - the final stage (the image that is deployed) runs as root: no `USER` in that stage (the base images default to
//     root), or a last `USER` of `root` or uid `0`.
// Exits 0 when every file passes, 1 listing each problem.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** The Dockerfiles of the images Vereino deploys (the app and the backup job), relative to the repository root. */
export const DOCKERFILES = ['Dockerfile', 'docker/backup/Dockerfile']

const DIGEST_PATTERN = /@sha256:[0-9a-f]{64}$/

/**
 * Joins `\` continuation lines, drops comments and blank lines.
 * @param {string} source
 * @returns {{ line: number, instruction: string, args: string }[]}
 */
export function parseInstructions(source) {
  const instructions = []
  const lines = source.split(/\r?\n/)
  let buffer = ''
  let startLine = 0
  lines.forEach((raw, index) => {
    const trimmed = raw.trim()
    if (buffer === '' && (trimmed === '' || trimmed.startsWith('#'))) return
    if (buffer !== '' && trimmed.startsWith('#')) return
    if (buffer === '') startLine = index + 1
    if (trimmed.endsWith('\\')) {
      buffer += `${trimmed.slice(0, -1)} `
      return
    }
    const full = `${buffer}${trimmed}`.trim()
    buffer = ''
    if (full === '') return
    const match = /^(\S+)\s*(.*)$/.exec(full)
    instructions.push({ line: startLine, instruction: match[1].toUpperCase(), args: match[2] })
  })
  return instructions
}

/**
 * @param {string} args the arguments of a `FROM` instruction
 * @returns {{ image: string, stage: string | null }}
 */
export function parseFrom(args) {
  const parts = args.split(/\s+/).filter((part) => !part.startsWith('--'))
  const asIndex = parts.findIndex((part) => part.toUpperCase() === 'AS')
  return { image: parts[0] ?? '', stage: asIndex >= 0 ? (parts[asIndex + 1] ?? '').toLowerCase() : null }
}

/** @param {string} user the argument of a `USER` instruction */
export function isRootUser(user) {
  const name = user.trim().split(':')[0]
  return name === '' || name === 'root' || name === '0'
}

/**
 * @param {string} file a label for messages (the relative path)
 * @param {string} source the Dockerfile text
 * @returns {string[]} the problems found
 */
export function checkDockerfile(file, source) {
  const errors = []
  const stages = new Set()
  let finalStageUser = null
  let finalStageLine = 0
  for (const { line, instruction, args } of parseInstructions(source)) {
    if (instruction === 'FROM') {
      const { image, stage } = parseFrom(args)
      const isStageOrScratch = image.toLowerCase() === 'scratch' || stages.has(image.toLowerCase())
      if (!isStageOrScratch && !DIGEST_PATTERN.test(image)) {
        errors.push(`${file}:${String(line)}: base image "${image}" is not pinned by digest (use <image>:<tag>@sha256:<digest>)`)
      }
      if (stage) stages.add(stage)
      finalStageUser = null
      finalStageLine = line
    } else if (instruction === 'USER') {
      finalStageUser = args
    }
  }
  if (finalStageLine === 0) {
    errors.push(`${file}: no FROM instruction`)
  } else if (finalStageUser === null) {
    errors.push(`${file}:${String(finalStageLine)}: the final stage sets no USER, so the image runs as root`)
  } else if (isRootUser(finalStageUser)) {
    errors.push(`${file}: the final stage runs as root (USER ${finalStageUser.trim()})`)
  }
  return errors
}

/**
 * @param {string} rootDir
 * @param {string[]} [files]
 * @returns {string[]}
 */
export function checkRepository(rootDir, files = DOCKERFILES) {
  return files.flatMap((file) => {
    const fullPath = path.join(rootDir, file)
    if (!fs.existsSync(fullPath)) return [`${file}: file not found`]
    return checkDockerfile(file, fs.readFileSync(fullPath, 'utf8'))
  })
}

/**
 * @param {{ argv?: string[], cwd?: string, log?: (line: string) => void, error?: (line: string) => void }} [options]
 * @returns {number}
 */
export function runCli({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  log = (line) => console.log(line),
  error = (line) => console.error(line),
} = {}) {
  const rootIndex = argv.indexOf('--root')
  const rootDir = rootIndex >= 0 && argv[rootIndex + 1] ? path.resolve(argv[rootIndex + 1]) : cwd
  const errors = checkRepository(rootDir)
  if (errors.length === 0) {
    log(`dockerfiles:check: ${String(DOCKERFILES.length)} Dockerfile(s) pinned by digest, final stages non-root`)
    return 0
  }
  for (const message of errors) error(message)
  error(`dockerfiles:check: ${String(errors.length)} problem(s)`)
  return 1
}

/* node:coverage ignore next 3 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli()
}
