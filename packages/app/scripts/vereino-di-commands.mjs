// `di-commands:check` (lesson `di-reaches-no-command-file`): no Vereino module's `di.ts` may reach, through runtime
// imports, a file that registers commands. Importing a command file registers its commands. The CLI loads every
// module's `di.ts` and also the command files through the generated command loaders, so a command file pulled in by
// DI is registered twice and every `yarn mercato <module> …` call fails with "Duplicate command registration" — which
// only the integration tests notice (#386: di.ts -> rental-links -> request-queue -> calendar -> commands/zone-rules).
// A service that needs a helper of a command file takes it from `lib/` or `data/` instead.
// Usage: node scripts/vereino-di-commands.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP_ROOT, readVereinoModuleIds } from './vereino-paths.mjs'

const EXTENSIONS = ['', '.ts', '.tsx', '.mjs', '.js']

/** The file a relative or `@/` import names, or null for a package import or a file that does not exist. */
export function resolveImport(srcRoot, fromFile, spec) {
  let base
  if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec)
  else if (spec.startsWith('@/')) base = path.resolve(srcRoot, spec.slice(2))
  else return null
  for (const candidate of [...EXTENSIONS.map((ext) => `${base}${ext}`), path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  }
  return null
}

/** The specifiers a module loads at runtime: imports and re-exports, without `import type` and type-only braces. */
export function runtimeSpecifiers(source) {
  const specs = []
  // The clause stops at a quote, so a side-effect import (`import './x'`) never swallows the next line.
  for (const match of source.matchAll(/^(?:import|export)\s+(?!type\s)([^;'"]*?)\s+from\s+['"]([^'"]+)['"]/gm)) {
    const clause = match[1].trim()
    const braces = /^\{([^}]*)\}$/.exec(clause)
    if (braces && braces[1].split(',').every((part) => !part.trim() || /^\s*type\s/.test(part))) continue
    specs.push(match[2])
  }
  for (const match of source.matchAll(/^import\s+['"]([^'"]+)['"]/gm)) specs.push(match[1])
  return specs
}

/** A command file: under a module's `commands/` and calling `registerCommand(`. */
export function registersCommands(file, source) {
  return /[\\/]commands[\\/]/.test(file) && source.includes('registerCommand(')
}

/** Every command file reachable from `entry`, each with the import chain that reaches it. */
export function commandFilesReachedFrom(srcRoot, entry) {
  const chains = new Map([[entry, [entry]]])
  const queue = [entry]
  const found = []
  while (queue.length > 0) {
    const file = queue.shift()
    const source = fs.readFileSync(file, 'utf8')
    if (file !== entry && registersCommands(file, source)) found.push(chains.get(file))
    for (const spec of runtimeSpecifiers(source)) {
      const target = resolveImport(srcRoot, file, spec)
      if (target === null || chains.has(target)) continue
      chains.set(target, [...chains.get(file), target])
      queue.push(target)
    }
  }
  return found
}

export function checkDiCommands({ appRoot = APP_ROOT, moduleIds = readVereinoModuleIds(appRoot) } = {}) {
  const srcRoot = path.join(appRoot, 'src')
  const rel = (file) => path.relative(appRoot, file).split(path.sep).join('/')
  const errors = []
  let checked = 0
  for (const id of moduleIds) {
    const entry = path.join(srcRoot, 'modules', id, 'di.ts')
    if (!fs.existsSync(entry)) continue
    checked += 1
    for (const chain of commandFilesReachedFrom(srcRoot, entry)) {
      errors.push(
        `${rel(chain.at(-1))} registers commands and is reached from ${rel(entry)}: ${chain.map(rel).join(' -> ')}; take the helper from lib/ or data/ instead`,
      )
    }
  }
  return { checked, errors }
}

export function runCli({ appRoot, log = console.log, error = console.error }) {
  const result = checkDiCommands({ appRoot })
  for (const problem of result.errors) error(`di-commands:check: ${problem}`)
  log(`di-commands:check: ${String(result.checked)} di.ts file(s), ${String(result.errors.length)} problem(s)`)
  return result.errors.length > 0 ? 1 : 0
}

/* node:coverage ignore next 3 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli({})
}
