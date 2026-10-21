// Assembles a single-file version of the mockups (inline CSS + JS) with a "mockup" banner.
//   default: fictional club, municipality and people names (for sharing outside the club),
//   --real:  the real club name (for discussions inside the club; people and amounts are examples).
// Usage: node docs/ux-concept/mockups/build-artifact.mjs <output.html> [--real]
// Run build.mjs first: it produces app.js, i18n.js and logo.js.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const out = process.argv[2]
const real = process.argv.includes('--real')
if (!out) { console.error('Give the output file'); process.exit(1) }

// Anonymization of club data in app.js (fictional build). Order matters: longer phrases before shorter ones.
const REPLACE = [
  ['Gmina Liszki', 'Gmina Zielony Las'], ['Gminy Liszki', 'Gminy Zielony Las'], ['Gminą Liszki', 'Gminą Zielony Las'],
  ['Wisła Liszki', 'Wisła Brzezie'], ['Pływalnia partnerska, Liszki', 'Pływalnia partnerska, Zielony Las'], ['Liszki', 'Zielony Las'],
  ['KS Gwiazda Ściejowice', 'KS Przykład Dolina'], ['Ściejowice', 'Dolina'], ['Ściejowic', 'Doliny'],
  ['akademiagwiazdy@gmail.com', 'akademia@przyklad.example'], ['608 07 29 29', '600 000 111'], ['CIS Czernichów', 'UKS Sąsiedni'],
  ['Puchar Gwiazdy', 'Puchar Przykładu'], ['z Gwiazdą', 'z Przykładem'], ['Gwiazdy', 'Przykładu'], ['KS Gwiazda', 'KS Przykład'], ['Gwiazda', 'Przykład'], ['gwiazdy', 'przykladu'], ['gwiazda', 'przyklad'],
  ['LKS Rzeszotary', 'LKS Łąki'], ['UKS Mydlniki', 'UKS Górki'], ['mydlniki', 'gorki'], ['Mydlnicki', 'Górski'],
  ['Orzeł Kryspinów', 'Orzeł Brzozów'], ['Akademia Ruchu Kraków', 'Akademia Ruchu Miasto'], ['OZPN Kraków', 'OZPN'],
  ['Wojtek', 'Rafał'], ['wojtek', 'rafal'], ['Aneta', 'Joanna'], ['aneta', 'joanna'],
  ['Orlik 2024', 'Orlik'],
  ['>G</span>', '>P</span>'], ['>G</div>', '>P</div>'],
]
const apply = (s) => (real ? s : REPLACE.reduce((acc, [a, b]) => acc.split(a).join(b), s))

const css = readFileSync(join(dir, 'styles.css'), 'utf8')
const js = apply(readFileSync(join(dir, 'app.js'), 'utf8'))
// UI catalogs are inlined unchanged: they never contain club data, so the anonymization never has to touch them.
const i18n = readFileSync(join(dir, 'i18n.js'), 'utf8')
const leaked = REPLACE.map(([a]) => a).filter((a) => i18n.includes(a))
if (leaked.length) { console.error('i18n.js contains club data that would escape anonymization:', leaked.join(', ')); process.exit(1) }
for (const [name, code] of [['app.js', js], ['i18n.js', i18n]]) if (/<\/script/i.test(code)) { console.error(`${name} contains </script> — aborted`); process.exit(1) }

// The banner text and the brand label are rendered by the app in the current UI language (keys artifact.banner*, chrome.brand.*).
const html = `${real ? '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">\n' : ''}<title>${real ? 'Vereino mockup — LKS Gwiazda' : 'Vereino mockup'}</title>
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
// Check (fictional build only): no real name is left in the file.
if (!real) for (const w of ['Gwiazd', 'gwiazd', 'Liszk', 'Ściejow', 'Rzeszot', 'Mydln', 'Kryspin', 'Wojt', 'Anet', 'Kraków', 'Czernich', '608 07', 'gmail']) if (html.includes(w)) console.warn('WARNING: still contains', w)
