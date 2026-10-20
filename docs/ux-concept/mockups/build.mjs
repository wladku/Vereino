// Buduje app.js z app.ts bez zależności: Node >= 23.2 (module.stripTypeScriptTypes).
// Użycie: node docs/ux-concept/mockups/build.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripTypeScriptTypes } from 'node:module'

const dir = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(dir, 'app.ts'), 'utf8')
const js = stripTypeScriptTypes(source, { mode: 'strip' })
const banner = '// Wygenerowane z app.ts przez build.mjs — nie edytuj ręcznie.\n'
writeFileSync(join(dir, 'app.js'), banner + js)
console.log('app.js:', js.length, 'znaków')

// Logo klubu: pierwszy znaleziony plik logo-klubu.png|jpg|jpeg|webp → logo.js (data URI).
const types = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }
const found = Object.keys(types).map((ext) => [ext, join(dir, `logo-klubu.${ext}`)]).find(([, f]) => existsSync(f))
const logo = found ? `data:${types[found[0]]};base64,${readFileSync(found[1]).toString('base64')}` : ''
writeFileSync(join(dir, 'logo.js'), `${banner}window.VEREINO_LOGO = ${JSON.stringify(logo)}\n`)
console.log('logo.js:', found ? `z pliku ${found[1]}` : 'brak pliku logo-klubu.* — przykładowa gwiazda')
