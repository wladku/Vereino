---
title: "Seed today's rental through the request probe and fix the browser clock for client-side time rules"
modules: ["facilities"]
areas: ["testing"]
topics: ["integration-tests", "time", "fixtures", "probe", "playwright-clock"]
---

# Seed today's rental through the request probe and fix the browser clock for client-side time rules

**Context**: TEST-R13 (#282) needs a rental of *today* on the attendant's "Today at the facility" page, and a "No-show" tap that the page answers "too early" before the rental starts without calling the API.

**Problem**: `POST /api/facilities/rentals` refuses a start in the past (`rental_start_past`) and the pitch fixture's bookable windows end at 22:00, so a rental "later today" exists only at some hours; E08-S06 skips its rental part after the evening slot. A "before the start" check that reads `new Date()` in the browser is equally hour-dependent.

**Rule**: Store today's rental with the request probe's `rental` op (`runRequestProbe(club, { op: 'rental', placeId, startsAt, endsAt, renterId, renterDisplayName, contactName, contactPhone })`), which writes a `requested` phone rental at any time of today through the ORM (encrypted columns as the command writes them, no charge). For a rule the page evaluates on the client, pin the browser with `page.clock.setFixedTime(zoneInstant(today, '00:30'))` before the first `goto`: every entry of today is then ahead of the browser, while the server keeps the real time (keep future-dated writes such as a slot-dialog rental on a later day). When a test uploads a deliberately invalid file, exclude exactly that status (`status of 422`) from the console-error check, as TEST-R04 does for its intended 409s.

**Applies to**: `packages/app/.ai/qa/tests/_fixtures/facilities-request-probe/probe.mjs`, `packages/app/.ai/qa/tests/facilities/TEST-R13-attendant-on-the-phone.spec.ts`, and any facilities test that needs a rental of today.
