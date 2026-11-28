---
title: "Under the 0.10 nonce CSP an inline <style> without the nonce is blocked; find it by its violation event"
modules: ["platform", "facilities", "foundation", "club_core"]
areas: ["backend-ui", "testing"]
topics: ["csp", "platform-upgrade", "integration-tests", "radix"]
---

# Under the 0.10 nonce CSP an inline <style> without the nonce is blocked; find it by its violation event

**Context**: After the Open Mercato 0.10.1 upgrade (#498, PR #887) nine facilities integration tests failed on one console error, "Applying inline style violates … style-src 'self' 'nonce-…'", with the same hash on every page. E20-S07 failed the same way on `page.addStyleTag`. The CI log named neither the element nor its source.

**Problem**: The platform CSP since 0.10 is `style-src 'self' 'nonce-…'` (`style-src-attr 'unsafe-inline'`, so `style=""` attributes still work). Any `<style>` element without the nonce is blocked: one a library injects at run time (Radix `Select.Viewport`, inside the platform `SelectContent`, which passes no nonce) and one a test injects (`page.addStyleTag`). The console message shows only a hash, and local `yarn dev` does not reproduce it, because development keeps `'unsafe-inline'`.

**Rule**: To find the source, add a `securitypolicyviolation` listener through `page.addInitScript` in a local run of the failing test, and log `violatedDirective`, `sourceFile`, `lineNumber` and `(target as Element).outerHTML`. For a fixed library stylesheet, add its hash in `src/proxy.ts` through `withStyleHashes` (`@vereino/core`), with a unit test that recomputes the hash from the exact text; never add `'unsafe-inline'`. In a test, hide or restyle through the CSSOM (`element.style.setProperty`), never through `addStyleTag`. Vereino's own inline `<style>` takes the nonce from the `x-nonce` request header (see `OutlinePrintPage`).

When `main` is merged into a branch that has this CSP, grep the incoming diff for `<style`, `<script`, `dangerouslySetInnerHTML` and `onclick=`. A merge can be free of text conflicts and still bring inline code that the CSP blocks. In #887 the merge of #873 brought an un-nonced install-offer `<script>` in `layout.tsx`, and an `/offline` page with a bare `<style>` and an `onclick` handler. `script-src-attr 'none'` blocks every inline handler, nonce or not. Give the script and the style the nonce, attach the handler from a nonced script, and assert in a browser test that the style applies (a `toHaveCSS` check failed with `Received: "0px"` without the nonce).

**Applies to**: `packages/app/src/proxy.ts`, `src/app/layout.tsx`, route handlers that return HTML (`src/app/offline/route.ts`), merges of `main` into a CSP-changing branch, `packages/core/src/content-security-policy.ts`, `@open-mercato/ui` primitives that render Radix components, browser tests that assert an empty console.
