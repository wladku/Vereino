// `ds:check` for the images in `public/` (#485): every colour an SVG there paints with must be the value of a design
// token declared in `src/app/globals.css` (light or dark), so the product mark and any later icon stay on the tokens.
// An SVG loaded as an image cannot read CSS variables, so it carries the token's literal value instead (for example
// `oklch(0.205 0 0)`, the light `--primary`). Keywords that paint nothing new (`none`, `transparent`, `currentColor`,
// `inherit`, `url(#…)`) are always allowed.
import fs from 'node:fs'
import path from 'node:path'

export const SVG_TOKEN_RULE = Object.freeze({
  id: 'svg-colour-outside-tokens',
  description: 'An SVG in public/ may only use colours that are design-token values from src/app/globals.css.',
})

const COLOUR_FUNCTION = String.raw`(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^)]*\)`
// A colour is 3, 4, 6 or 8 hex digits, never an element reference (`url(#id)`, `href="#id"`).
const HEX = String.raw`(?<!url\(\s*['"]?|href\s*=\s*['"])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b`
const PAINT_PROPERTIES = String.raw`fill|stroke|stop-color|flood-color|lighting-color|color`
const ALLOWED_KEYWORDS = new Set([
  'none',
  'transparent',
  'currentcolor',
  'inherit',
  'initial',
  'unset',
  'context-fill',
  'context-stroke',
])

/** One spelling for one colour: lower case, single spaces, none around parentheses and commas. */
export function normalizeColour(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),/])\s*/g, '$1')
}

/** The colour literals of every custom property declared in a stylesheet (`--name: <colour>;`). */
export function tokenColours(css) {
  const colours = new Set()
  const literal = new RegExp(`^(?:${COLOUR_FUNCTION}|${HEX})$`, 'i')
  for (const match of css.matchAll(/--[\w-]+\s*:\s*([^;{}]+);/g)) {
    const value = match[1].trim()
    if (literal.test(value)) colours.add(normalizeColour(value))
  }
  return colours
}

/**
 * The colours an SVG source paints with, each with its offset: every hex or functional colour anywhere in it, and
 * every other value of a paint attribute (`fill="red"`) or paint property (`fill: red`) except the allowed keywords.
 */
export function svgColours(source) {
  const found = new Map()
  for (const match of source.matchAll(new RegExp(`${COLOUR_FUNCTION}|${HEX}`, 'gi'))) {
    found.set(match.index, match[0])
  }
  const paint = new RegExp(`(?:^|[\\s;{"'])(?:${PAINT_PROPERTIES})\\s*(?:=\\s*["']|:\\s*)([^"';}]+)`, 'g')
  for (const match of source.matchAll(paint)) {
    const value = match[1].trim()
    const offset = match.index + match[0].lastIndexOf(match[1]) + match[1].indexOf(value)
    if (ALLOWED_KEYWORDS.has(value.toLowerCase()) || /^url\(/i.test(value)) continue
    if (![...found.keys()].some((start) => start >= offset && start < offset + value.length)) found.set(offset, value)
  }
  return [...found.entries()].sort(([a], [b]) => a - b).map(([offset, value]) => ({ offset, value }))
}

/** The `.svg` files directly in `<root>/public`, sorted; none when the folder is missing. */
export function publicSvgFiles(root) {
  const publicRoot = path.join(root, 'public')
  if (!fs.existsSync(publicRoot)) return []
  return fs
    .readdirSync(publicRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.svg'))
    .map((entry) => path.join(publicRoot, entry.name))
    .sort()
}

/**
 * The colours outside the tokens in every SVG of `<root>/public`: `{ file, source, match, offset }` per colour, with
 * `file` relative to `root`. Without `src/app/globals.css` no colour is a token, so every colour is reported.
 */
export function scanPublicSvgs(root) {
  const cssPath = path.join(root, 'src', 'app', 'globals.css')
  const tokens = fs.existsSync(cssPath) ? tokenColours(fs.readFileSync(cssPath, 'utf8')) : new Set()
  const files = publicSvgFiles(root)
  const findings = []
  for (const absolutePath of files) {
    const source = fs.readFileSync(absolutePath, 'utf8')
    const file = path.relative(root, absolutePath).split(path.sep).join('/')
    for (const colour of svgColours(source)) {
      if (!tokens.has(normalizeColour(colour.value)))
        findings.push({ file, source, match: colour.value, offset: colour.offset })
    }
  }
  return { filesScanned: files.length, findings }
}
