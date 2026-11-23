// Runs in the browser before the app hydrates (Next.js client instrumentation).
//
// The production CSP has no `'unsafe-eval'` (engineering standards S8.4, #463). zod v4 probes for eval support with
// `new Function("")` on its first parse; the probe's error is caught, but the browser still reports it as a CSP
// violation on every page. `jitless` skips the probe and the JIT, and validation results are the same. The setting is
// zod's global config (`globalThis.__zod_globalConfig`), so it covers the platform's forms too.
import { z } from 'zod'

z.config({ jitless: true })
