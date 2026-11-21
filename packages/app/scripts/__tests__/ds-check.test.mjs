// `ds:check`: the colour-named status token `--status-pink-*` is outside `docs/ux-concept/tokens.md`, so Vereino code
// may not use it (#495); the semantic status tokens stay allowed and a comment that names the token is no finding.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { scanDesignSystem } from '../ds-check.mjs'

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vereino-ds-check-'))
after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }))

// An app root holding one source file under src/.
function scanApp(name, source) {
  const root = path.join(fixtureRoot, name)
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.writeFileSync(path.join(root, 'src', 'Swatch.tsx'), source)
  return scanDesignSystem(root, { useIgnore: false })
}

test('a status-pink class or variable is a finding', () => {
  const result = scanApp(
    'pink',
    "export const a = 'border-status-pink-border bg-status-pink-bg'\nexport const b = `fill-[var(--status-pink-icon)]`\n",
  )
  assert.equal(result.ok, false)
  const pink = result.findings.filter((finding) => finding.rule === 'colour-named-status-token')
  assert.deepEqual(
    pink.map(({ line, match }) => ({ line, match })),
    [
      { line: 1, match: 'status-pink-' },
      { line: 1, match: 'status-pink-' },
      { line: 2, match: 'status-pink-' },
    ],
  )
})

test('the semantic status tokens and a comment naming status-pink pass', () => {
  const result = scanApp(
    'semantic',
    "// not --status-pink-bg: it is not in tokens.md\nexport const a = 'border-status-neutral-icon bg-status-success-bg text-status-info-text'\n",
  )
  assert.deepEqual(result.findings, [])
  assert.equal(result.ok, true)
})
