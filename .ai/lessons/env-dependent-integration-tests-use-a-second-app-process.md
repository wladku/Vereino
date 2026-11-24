---
title: "Test behaviour behind an environment variable in a second app process or the probe, never in the shared test app"
modules: ["club_core", "foundation", "platform"]
areas: ["testing", "integration"]
topics: ["integration-tests", "environment", "club-domain", "hostname", "messaging-probe"]
---

# Test behaviour behind an environment variable in a second app process or the probe, never in the shared test app

**Context**: Many clubs phase 3 (#631) switches club addresses, redirects and e-mail links on `VEREINO_CLUB_DOMAIN`.
`yarn test:integration:vereino` starts one app for every spec with a fixed environment (`buildAppEnv`), so setting the
variable there would move `/p/<slug>` pages and e-mailed links of every other test to other hosts, where their
host-only session cookies are not sent.

**Problem**: A variable added to the shared test app changes what every older test sees; a test that needs it cannot
set it per test in that process.

**Rule**: Keep the shared app's environment as it is. For pages and routes, start a second `next start` process from
the same build and database with the extra variables (`_fixtures/club-domain.ts`: free port, private
`QUEUE_BASE_DIR`, no workers, the process group stopped in `afterAll`); club subdomains work as
`<slug>.localhost:<port>`, which Chromium resolves to the loopback address without DNS. For e-mails and services, run
them in the messaging probe and set the variable with its `env` step (`runProbe`; `routeGet` with `withBody` returns
the route's body). Do all writes through the shared app, so its workers process the events.

**Applies to**: `packages/app/.ai/qa/tests/_fixtures/club-domain.ts`, `_fixtures/messaging.ts`, any spec that needs a
`VEREINO_*` or platform variable the shared test app does not set.
