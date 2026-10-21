// Prettier for Vereino-owned files only (engineering standards ADR-017, S3.1).
// Platform-owned scaffold files are never reformatted, so this script lists the owned paths
// explicitly instead of formatting the whole repository.
// Usage: node scripts/vereino-format.mjs [--check]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as prettier from 'prettier'
import * as tailwindPlugin from 'prettier-plugin-tailwindcss'
import { REPO_ROOT, PLATFORM_FILES_IN_VEREINO_PATHS, readVereinoModuleIds, vereinoAppGlobs } from './vereino-paths.mjs'

const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'])

// Globs relative to the repository root.
export function vereinoFormatGlobs(moduleIds) {
  return [
    ...vereinoAppGlobs(moduleIds).map((glob) => `packages/app/${glob}`),
    'packages/{core,db,ui}/src/**',
    'packages/{core,db,ui}/eslint.config.mjs',
    'packages/app/vereino-modules.json',
    'packages/app/scripts/vereino-*.mjs',
    'packages/app/scripts/check-vereino-contracts.mjs',
    'packages/app/scripts/__tests__/**',
    'scripts/verify.mjs',
    'eslint.vereino.mjs',
  ]
}

export function listVereinoFiles({ repoRoot = REPO_ROOT, moduleIds = readVereinoModuleIds() } = {}) {
  const excluded = new Set(PLATFORM_FILES_IN_VEREINO_PATHS.map((file) => `packages/app/${file}`))
  const files = new Set()
  for (const glob of vereinoFormatGlobs(moduleIds)) {
    for (const match of fs.globSync(glob, { cwd: repoRoot })) {
      const relative = match.split(path.sep).join('/')
      if (relative.includes('/node_modules/') || excluded.has(relative)) continue
      if (!EXTENSIONS.has(path.extname(relative))) continue
      if (fs.statSync(path.join(repoRoot, relative)).isFile()) files.add(relative)
    }
  }
  return [...files].sort()
}

// Checks (and unless `check` is set, rewrites) each file; returns the files that were not formatted.
export async function formatFiles({ files, repoRoot = REPO_ROOT, check }) {
  const unformatted = []
  for (const relative of files) {
    const absolute = path.join(repoRoot, relative)
    const options = { ...(await prettier.resolveConfig(absolute)), filepath: absolute, plugins: [tailwindPlugin] }
    const source = fs.readFileSync(absolute, 'utf8')
    if (await prettier.check(source, options)) continue
    unformatted.push(relative)
    if (!check) fs.writeFileSync(absolute, await prettier.format(source, options))
  }
  return unformatted
}

export async function runCli({ argv, repoRoot = REPO_ROOT, moduleIds, log = console.log, error = console.error }) {
  const check = argv.includes('--check')
  const files = listVereinoFiles({ repoRoot, moduleIds })
  const unformatted = await formatFiles({ files, repoRoot, check })
  if (check) for (const relative of unformatted) error(`format:check: ${relative} is not formatted (run yarn format)`)
  const label = check ? 'format:check' : 'format'
  const verb = check ? 'unformatted' : 'reformatted'
  log(`${label}: ${String(files.length)} Vereino file(s), ${String(unformatted.length)} ${verb}`)
  return check && unformatted.length > 0 ? 1 : 0
}

/* node:coverage ignore next 3 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCli({ argv: process.argv.slice(2) })
}
