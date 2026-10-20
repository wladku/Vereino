#!/usr/bin/env node
// Makes the installed Open Mercato sources reachable from the repository root.
//
// Workspaces keep their own node_modules (`nmHoistingLimits: workspaces`), so the framework
// packages are installed in packages/app/node_modules. The framework guides and generated
// module facts in .ai/guides link to `node_modules/@open-mercato/...` relative to the
// repository root and must not be edited, so this links root node_modules/@open-mercato
// to the app's copy (a junction on Windows, a directory symlink elsewhere). Read-only use.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, 'packages', 'app', 'node_modules', '@open-mercato')
const link = path.join(root, 'node_modules', '@open-mercato')

if (!fs.existsSync(target)) {
  console.warn(`[link-framework-sources] skipped: ${path.relative(root, target)} does not exist (dependencies not installed yet)`)
  process.exit(0)
}

const existing = fs.lstatSync(link, { throwIfNoEntry: false })
if (existing) {
  if (existing.isSymbolicLink() && path.resolve(path.dirname(link), fs.readlinkSync(link)) === target) process.exit(0)
  if (!existing.isSymbolicLink()) {
    console.warn(`[link-framework-sources] skipped: ${path.relative(root, link)} is a real directory`)
    process.exit(0)
  }
  fs.unlinkSync(link)
}

fs.mkdirSync(path.dirname(link), { recursive: true })
fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir')
console.log(`[link-framework-sources] ${path.relative(root, link)} -> ${path.relative(root, target)}`)
