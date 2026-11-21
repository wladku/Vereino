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

// #492 (E20-S13): `<Alert>` defaults to the heavy `light` look, so every Alert names its `style`; an information notice
// is the `Notice` component. That `style` is the Alert's look, not an inline CSS style.
test('an Alert without a style is a finding, even past an arrow function in its props', () => {
  const result = scanApp(
    'alert-missing',
    [
      'export const A = () => <Alert status="error">x</Alert>',
      'export const B = () => <Alert onDismiss={() => go(a > b)}',
      '  status="warning">x</Alert>',
      'export const C = () => <Alert onDismiss={() => go()} style="light">x</Alert>',
      '',
    ].join('\n'),
  )
  assert.equal(result.ok, false)
  assert.deepEqual(
    result.findings.map(({ rule, line, match }) => ({ rule, line, match })),
    [
      { rule: 'alert-without-style', line: 1, match: '<Alert' },
      { rule: 'alert-without-style', line: 2, match: '<Alert' },
    ],
  )
})

test('an Alert with a style, a Notice and the Alert parts pass; a style on any other tag is still inline-style', () => {
  const result = scanApp(
    'alert-styled',
    [
      "export const A = () => <Alert style={free ? 'lighter' : 'light'} status=\"information\"><AlertTitle>t</AlertTitle></Alert>",
      'export const B = () => <Notice><AlertDescription>d</AlertDescription></Notice>',
      '// <Alert status="error"> in a comment is no finding',
      'export const C = () => <div style={{ color: x }} />',
      '',
    ].join('\n'),
  )
  assert.deepEqual(
    result.findings.map(({ rule, line }) => ({ rule, line })),
    [{ rule: 'inline-style', line: 4 }],
  )
})
