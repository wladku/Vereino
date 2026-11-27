---
title: "src/modules.ts is parsed statically: gate modules only with process.env or parseBooleanWithDefault"
modules: ["platform", "foundation"]
areas: ["architecture"]
topics: ["modules-ts", "generator", "enterprise", "package-exports"]
---

# src/modules.ts is parsed statically: gate modules only with process.env or parseBooleanWithDefault

**Context**: The Vereino Enterprise overlay (#713, `.ai/specs/2026-11-23-vereino-enterprise-package.md` DD-E03) registers
the modules of `@vereino/enterprise` only in some builds. The first idea was to test whether the package is installed
(`fs.existsSync`, `require.resolve`) inside `src/modules.ts`.

**Problem**: `yarn generate` never runs `src/modules.ts`. `@open-mercato/cli/dist/lib/resolver.js`
(`parseModulesFromSource`) parses it with the TypeScript compiler and evaluates an `if` condition only over literals,
`process.env.X` reads, local constants, `!`, `&&`, `||`, `===`, `.some(...)` and a call named exactly
`parseBooleanWithDefault`. Any other call evaluates to `undefined`, so the block is silently dropped from the generated
registry while the browser (which evaluates the file again in `ClientBootstrap.tsx`, with only `NEXT_PUBLIC_` variables)
may still see it. Two more traps of a package module source: the generator imports `<package>/modules/<id>/<file>`
without an extension, so an `exports` target `./src/modules/*` does not resolve (map `./modules/*` to
`["./src/modules/*.ts", "./src/modules/*.tsx"]` and `./modules/*.json` to the catalogs); and `module-package-sources.css`
lists only packages that ship `dist/modules/<id>`, so a source-only package needs its own `@source` line.

**Rule**: Gate a `modules.ts` block only with `process.env.<NEXT_PUBLIC_…>` or `parseBooleanWithDefault(process.env.…,
default)` imported under that exact name, and check the result in `.mercato/generated/enabled-module-ids.generated.ts`
after `yarn generate` with and without the switch. Keep a boot check that compares the build's switch with the
registered ids (`foundation/lib/enterprise-build.ts`), so a parser change upstream fails loudly instead of dropping
modules.

**Applies to**: `packages/app/src/modules.ts`, any module registered `from` a package other than `@app`, the Enterprise
overlay (`scripts/enterprise-overlay.mjs`, `packages/app/.ai/qa/fixtures/enterprise-overlay/`), platform upgrades that
touch the CLI resolver.
