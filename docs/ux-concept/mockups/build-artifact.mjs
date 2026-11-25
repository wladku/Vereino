// Assembles a single-file version of the mockups (inline CSS + JS) with a "mockup" banner.
//   default: the fictional example club of the mockups (for sharing),
//   --real:  a standalone page that also embeds the club logo from logo-klubu.* (see build.mjs).
// The mockup data is fictional (KS Przykład Dolina, Gmina Zielony Las; 2026-11-25), so nothing is replaced.
// Usage: node docs/ux-concept/mockups/build-artifact.mjs <output.html> [--real]
// Run build.mjs first: it produces app.js, i18n.js and logo.js.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const out = process.argv[2]
const real = process.argv.includes('--real')
if (!out) { console.error('Give the output file'); process.exit(1) }

const css = readFileSync(join(dir, 'styles.css'), 'utf8')
const js = readFileSync(join(dir, 'app.js'), 'utf8')
const i18n = readFileSync(join(dir, 'i18n.js'), 'utf8')
for (const [name, code] of [['app.js', js], ['i18n.js', i18n]]) if (/<\/script/i.test(code)) { console.error(`${name} contains </script> — aborted`); process.exit(1) }

// The banner text and the brand label are rendered by the app in the current UI language (keys artifact.banner*, chrome.brand.*).
const html = `${real ? '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">\n' : ''}<title>${real ? 'Vereino mockup — KS Przykład' : 'Vereino mockup'}</title>
<style>
${css}
.mock-banner { background: var(--status-warning-bg); color: var(--status-warning-text); border-bottom: 1px solid var(--status-warning-border); font-size: 12.5px; padding-block: 6px; padding-inline: max(16px, env(safe-area-inset-left, 0px)) max(16px, env(safe-area-inset-right, 0px)); }
.mock-banner:empty { display: none; }
</style>${real ? '\n</head><body>' : ''}
<div class="mock-banner" id="mock-banner" role="note"></div>
<div id="chrome"></div>
<main id="stage" class="stage"></main>
<div id="drawer"></div>
<div id="modal"></div>
<div id="toasts" class="toasts" role="status" aria-live="polite"></div>
<script>
window.VEREINO_BUILD = ${JSON.stringify(real ? 'real' : 'fictional')}
${i18n}
</script>
${real ? `<script>\n${readFileSync(join(dir, 'logo.js'), 'utf8')}\n</script>\n` : ''}<script>
${js}
</script>
${real ? '</body></html>\n' : ''}`
writeFileSync(out, html)
console.log('written', out, html.length, 'chars')
// Check: no real e-mail provider address slipped into the build.
if (html.includes('@gmail.')) console.warn('WARNING: the build contains a gmail address')
