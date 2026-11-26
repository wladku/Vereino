# Edge proxy on a trigger: D-043 and its runbook (#739)

- **Date:** 2026-11-26
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` with the repo-local override, Cezar run 97d2aad8
- **Trigger:** `cezar` label on issue #739 (E25-S05, epic #734)
- **Spec / issue / branch:** no spec (decision record and runbook, route `direct`); #739;
  `docs/issue-739-edge-proxy-decision`
- **Status:** completed; no proxy is set up (the owner's decision)

## Goal

Record the owner's decision of 2026-11-26 on #739 ("edge proxy on a trigger, not now") as a decision record with its
triggers, and write the runbook for when a trigger fires: DNS, the TLS mode, an origin reachable only through the
proxy, WAF and rate-limit rules, the incident bypass, the processors row and the DPA.

## Steps

1. Claimed #739 (assignee, `in-progress`, `🤖` claim comment naming this run, worktree and branch).
2. Read the epic #734, D-036, D-039, D-042 (format), `processors.md`, `deploy.md` (*Rate limits*, *Club addresses*,
   *Lock down production*), `incident.md` and PR #751 (the app's limits, #738).
3. Checked that no open PR or remote branch already used D-043.
4. Read Railway's documentation on 2026-11-26 (web-fetch subagent): domains (Cloudflare and wildcard sections), edge
   rules, WAF (Under Attack Mode) and CDN.
5. Wrote D-043, `docs/ops/edge-proxy.md` (A: an attack before a proxy exists; B: setting up the proxy; C: bypass),
   links from `deploy.md` and `incident.md`, the "Not recipients" bullet in `processors.md` and the D43 brief row.

## Decisions

- **The runbook is its own file** (`docs/ops/edge-proxy.md`), like `backups.md` and `monitoring.md`. It has three
  parts used at different times, and `deploy.md` is already long.
- **No processors row now.** There is no proxy, so the register gets a "Not recipients" bullet. The runbook makes
  adding the row, signing the DPA and telling the clubs step B2, before any real traffic.
- **Railway facts that changed since the epic.** The epic said Railway has no configurable WAF rules. On 2026-11-26
  its documentation describes edge rules (block, allow or challenge by IPv4 address, header or path) and Under Attack
  Mode, but no rate limit. D-043 makes them the steps between the app's limits and a proxy. The documentation names
  no plan for either, so the owner checks this in the dashboard.
- **TLS: Full, not Full (strict).** The issue asked for "full/strict". Railway's documentation says a Cloudflare-proxied
  domain needs Full and that Full (strict) does not work as intended. The runbook records this, prefers the vendor's
  outbound tunnel, and leaves Full with a closed origin to the owner's approval.
- **Inferences marked as tests.** Railway's documentation does not say how a missing header or an IPv6 source is
  treated by a blocking rule. The runbook turns both into checks rather than facts.
- **The vendor is not named.** Cloudflare appears only as an example and for its feature names. The criteria table
  leaves the choice to the owner when a trigger fires (D-043 *Not decided here*).

## Files changed

- `.ai/specs/research/decisions/D-043-edge-proxy-on-a-trigger.md` (new)
- `docs/ops/edge-proxy.md` (new)
- `docs/ops/deploy.md`, `docs/ops/incident.md`, `docs/compliance/processors.md`, `.ai/specs/product-brief.md`
- this run log

## Commands and results

- `yarn verify`: all 23 steps passed (generate, typecheck, lint, format:check, the checks, test, test:scripts, build).
- No integration test: documentation only, no route, command or page changed.

## Open problems / next steps

- The owner checks which Railway plan includes edge rules and Under Attack Mode, and the edge rule limit.
- When a trigger fires, follow `docs/ops/edge-proxy.md` B and write the vendor decision record.
