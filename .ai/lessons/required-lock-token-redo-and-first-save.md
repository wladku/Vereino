---
title: "A required lock token must spare the audit redo and a singleton's first save"
modules: ["foundation", "club_core", "platform"]
areas: ["module-data", "debugging"]
topics: ["optimistic-locking", "commands", "undo-redo", "authorize-scoped"]
---

# A required lock token must spare the audit redo and a singleton's first save

**Context**: 2026-10-31, review of PR #62 (#33): the platform's `enforceCommandOptimisticLockWithGuards` is a no-op without a token, so `authorizeScoped` now answers 400 `lock_token_required` for an update, delete or action on a loaded target without one (S5.2).

**Problem**: Two legitimate callers have no token. The platform redo (`POST /api/audit_logs/audit-logs/actions/redo`) replays the handler's `execute` (no Vereino handler defines `redo`) with the redo request as `ctx.request`, which carries no lock header; only undo goes through `authorizeReplay` with `{ mode: 'replay' }`. And the club settings row is created with its defaults inside the first save (`ensureClubSettingsRow`), while the read answered `updatedAt: null`, so the client has nothing to send.

**Rule**: Treat a context that carries `replayTransactionGuard` (set only by the audit undo/redo routes) as a replay: scope checked, token not required. For a singleton created on first write, give the spec `acceptsMissingToken` evaluated on the row-locked target (club_core: `createdAt === updatedAt`), never `lock: 'none'` — a racing second first-save then sees an edited row and needs the token. Cover redo in TEST-F01 whenever the lock rule changes; no Vereino role holds `audit_logs.redo_self`, so the test grants it to the club's platform role first (a redo without it answers 403 before any command runs).

**Applies to**: `foundation/services/authorize-scoped.ts`, every Vereino command with the default lock, `club_core` settings and club logo, future singletons created lazily.
