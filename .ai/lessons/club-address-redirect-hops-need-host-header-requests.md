---
title: "Stop a club-address redirect chain with Host-header requests, not page.route"
modules: ["foundation", "club_core"]
areas: ["testing"]
topics: ["integration-tests", "club-domain", "playwright", "oauth"]
---

# Stop a club-address redirect chain with Host-header requests, not page.route

**Context**: TEST-S05 (#700) had to stop a social sign-in round trip right before its hand-off on `<slug>.localhost:<port>`, so the hand-off token stayed unspent and could be replayed on another host or in another browser. A `page.route('**/handoff?**')` handler never fired: the hand-off is the third redirect hop of one navigation (start → provider fake → callback → hand-off), and the glob's `?` is not a literal question mark. The test timed out at `expect.poll` twice.

**Problem**: Playwright route handlers are unreliable for intermediate redirect hops, and the Playwright `request` fixture (Node) cannot be relied on to resolve `*.localhost` (Chromium does, glibc may not), so neither tool reaches a club's address mid-chain.

**Rule**: To drive or stop a redirect chain that passes through a club's address, send each hop yourself with `node:http` to `127.0.0.1:<port>` and the target's host in the `Host` header (`redirect` not followed), carrying the cookies by hand; use the browser `page` only for whole navigations whose end state you assert. Match Playwright routes with a URL predicate, never a glob containing `?`.

**Applies to**: `packages/app/.ai/qa/tests/**` specs that use `_fixtures/club-domain.ts` (TEST-M02/M03/M04, TEST-S05) and any OAuth or hand-off flow across hosts.
