// Lets `node --test` load the `.tsx` components of this package. Node strips types from `.ts` files on its own but
// knows no JSX, so this hook (registered through `--import` in the `test` script) transpiles every `.tsx` module with
// the package's own TypeScript, keeping an inline source map so the coverage report points at the `.tsx` lines
// (`--enable-source-maps`). `.ts` files and everything under `node_modules` go through Node's default loader; the
// platform primitives resolve to their compiled `dist/` files.
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

registerHooks({
  load(url, context, nextLoad) {
    if (!url.endsWith('.tsx')) return nextLoad(url, context)
    const fileName = fileURLToPath(url)
    const { outputText } = ts.transpileModule(readFileSync(fileName, 'utf8'), {
      fileName,
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        verbatimModuleSyntax: true,
        inlineSourceMap: true,
        inlineSources: true,
      },
    })
    return { format: 'module', source: outputText, shortCircuit: true }
  },
})
