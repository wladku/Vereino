// `ds:check` for `public/*.svg` (#485): only design-token colours from globals.css.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import {
  SVG_TOKEN_RULE,
  normalizeColour,
  publicSvgFiles,
  scanPublicSvgs,
  svgColours,
  tokenColours,
} from '../vereino-svg-tokens.mjs'

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vereino-svg-tokens-'))
after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }))

const CSS = `:root {
  --primary: oklch(0.205 0 0);
  --primary-foreground: OKLCH( 0.985  0 0 );
  --radius: 0.625rem;
  --accent: #1d4ed8;
  --alias: var(--primary);
}
.dark {
  --primary: oklch(0.922 0 0);
}
`

function writeApp(name, { css, files = {}, dirs = [] }) {
  const root = path.join(fixtureRoot, name)
  fs.mkdirSync(root, { recursive: true })
  if (css !== undefined) {
    fs.mkdirSync(path.join(root, 'src', 'app'), { recursive: true })
    fs.writeFileSync(path.join(root, 'src', 'app', 'globals.css'), css)
  }
  for (const [file, source] of Object.entries(files)) {
    fs.mkdirSync(path.join(root, 'public'), { recursive: true })
    fs.writeFileSync(path.join(root, 'public', file), source)
  }
  for (const dir of dirs) fs.mkdirSync(path.join(root, 'public', dir), { recursive: true })
  return root
}

test('the rule names itself for ds:check', () => {
  assert.equal(SVG_TOKEN_RULE.id, 'svg-colour-outside-tokens')
  assert.match(SVG_TOKEN_RULE.description, /design-token/)
})

test('normalizeColour gives one spelling per colour', () => {
  assert.equal(normalizeColour('  OKLCH( 0.985   0 0 ) '), 'oklch(0.985 0 0)')
  assert.equal(normalizeColour('rgb(1 , 2 , 3 / 50%)'), 'rgb(1,2,3/50%)')
  assert.equal(normalizeColour('#FFF'), '#fff')
})

test('tokenColours keeps the colour literals of custom properties only', () => {
  assert.deepEqual([...tokenColours(CSS)].sort(), [
    '#1d4ed8',
    'oklch(0.205 0 0)',
    'oklch(0.922 0 0)',
    'oklch(0.985 0 0)',
  ])
})

test('svgColours finds hex, functional and named paints, and skips the allowed keywords', () => {
  const source = [
    '<svg fill="none">',
    '<style>.a { fill: oklch(0.205 0 0); } .b{stroke:red}</style>',
    '<rect fill="#FFFFFF" fill-rule="evenodd" stroke-width="2"/>',
    "<path stroke='currentColor' fill='url(#g)'/>",
    '<stop stop-color="white"/>',
    '<g color="transparent"/>',
    '</svg>',
  ].join('\n')
  assert.deepEqual(
    svgColours(source).map((colour) => colour.value),
    ['oklch(0.205 0 0)', 'red', '#FFFFFF', 'white'],
  )
  const [first] = svgColours(source)
  assert.equal(source.slice(first.offset, first.offset + first.value.length), first.value)
  const named = svgColours(source).find((colour) => colour.value === 'white')
  assert.equal(source.slice(named.offset, named.offset + 5), 'white')
})

test('publicSvgFiles lists only SVG files directly in public/, and nothing without the folder', () => {
  const root = writeApp('files', { files: { 'b.svg': '<svg/>', 'A.SVG': '<svg/>', 'c.png': 'x' }, dirs: ['d.svg'] })
  assert.deepEqual(
    publicSvgFiles(root).map((file) => path.basename(file)),
    ['A.SVG', 'b.svg'],
  )
  assert.deepEqual(publicSvgFiles(writeApp('no-public', {})), [])
})

test('scanPublicSvgs passes token colours and reports every other colour with its file', () => {
  const root = writeApp('scan', {
    css: CSS,
    files: {
      'mark.svg': '<svg><rect fill="oklch(0.205 0 0)"/><path fill="OKLCH(0.985 0 0)"/><g fill="none"/></svg>',
      'old.svg': '<svg><rect fill="#1D4ED8"/><circle fill="#FACC15"/></svg>',
    },
  })
  const result = scanPublicSvgs(root)
  assert.equal(result.filesScanned, 2)
  assert.deepEqual(
    result.findings.map(({ file, match }) => ({ file, match })),
    [{ file: 'public/old.svg', match: '#FACC15' }],
  )
  assert.equal(result.findings[0].source.slice(result.findings[0].offset).startsWith('#FACC15'), true)
})

test('scanPublicSvgs without globals.css treats every colour as outside the tokens', () => {
  const root = writeApp('no-css', { files: { 'x.svg': '<svg><rect fill="#000"/></svg>' } })
  assert.deepEqual(
    scanPublicSvgs(root).findings.map((finding) => finding.match),
    ['#000'],
  )
})
