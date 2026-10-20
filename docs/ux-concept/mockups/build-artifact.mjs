// Składa jednoplikową wersję mockupów (inline CSS + JS) z paskiem „Makieta”.
//   domyślnie: fikcyjne nazwy klubu, gminy i osób (do udostępniania poza klubem),
//   --real:    nazwa LKS Gwiazda Ściejowice (do omawiania w klubie; osoby i kwoty przykładowe).
// Użycie: node docs/ux-concept/mockups/build-artifact.mjs <plik-wyjściowy.html> [--real]
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const out = process.argv[2]
const real = process.argv.includes('--real')
if (!out) { console.error('Podaj plik wyjściowy'); process.exit(1) }

// Kolejność ma znaczenie: dłuższe frazy przed krótszymi.
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
  ['Vereino · mockupy v0.1', 'Vereino · makieta — dane fikcyjne'],
]
const REAL_REPLACE = [['Vereino · mockupy v0.1', 'Vereino · makieta dla LKS Gwiazda']]
const apply = (s) => (real ? REAL_REPLACE : REPLACE).reduce((acc, [a, b]) => acc.split(a).join(b), s)
const banner = real
  ? '<b>Makieta interfejsu Vereino dla LKS Gwiazda Ściejowice.</b> Osoby, kwoty i terminy są przykładowe. To nie jest działający serwis ani płatność. Zmiany widzisz tylko Ty, w swojej przeglądarce.'
  : '<b>Makieta interfejsu Vereino.</b> Klub, gmina, osoby i kwoty są fikcyjne. To nie jest prawdziwy serwis ani płatność. Zmiany widzisz tylko Ty, w swojej przeglądarce.'

const css = readFileSync(join(dir, 'styles.css'), 'utf8')
const js = apply(readFileSync(join(dir, 'app.js'), 'utf8'))
if (/<\/script/i.test(js)) { console.error('app.js zawiera </script> — przerwano'); process.exit(1) }

const html = `${real ? '<!doctype html>\n<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">\n' : ''}<title>${real ? 'Makieta Vereino — LKS Gwiazda' : 'Makieta Vereino'}</title>
<style>
${css}
.mock-banner { background: var(--status-warning-bg); color: var(--status-warning-text); border-bottom: 1px solid var(--status-warning-border); font-size: 12.5px; padding-block: 6px; padding-inline: max(16px, env(safe-area-inset-left, 0px)) max(16px, env(safe-area-inset-right, 0px)); }
</style>${real ? '\n</head><body>' : ''}
<div class="mock-banner" role="note">${banner}</div>
<div id="chrome"></div>
<main id="stage" class="stage"></main>
<div id="drawer"></div>
<div id="modal"></div>
<div id="toasts" class="toasts" role="status" aria-live="polite"></div>
${real ? `<script>\n${readFileSync(join(dir, 'logo.js'), 'utf8')}\n</script>\n` : ''}<script>
${js}
</script>
${real ? '</body></html>\n' : ''}`
writeFileSync(out, html)
console.log('zapisano', out, html.length, 'znaków')
// Kontrola (tylko wersja fikcyjna): żadna prawdziwa nazwa nie została w pliku.
if (!real) for (const w of ['Gwiazd', 'gwiazd', 'Liszk', 'Ściejow', 'Rzeszot', 'Mydln', 'Kryspin', 'Wojt', 'Anet', 'Kraków', 'Czernich', '608 07', 'gmail']) if (html.includes(w)) console.warn('UWAGA: zostało', w)
