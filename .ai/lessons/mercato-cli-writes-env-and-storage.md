---
title: "yarn mercato copies .env.example to .env; pass DATABASE_URL explicitly and remove .env and storage/ after a run"
modules: ["platform"]
areas: ["ai-workflow"]
topics: ["mercato-cli", "db-generate", "env", "uploads", "worktrees"]
---

# yarn mercato copies .env.example to .env; pass DATABASE_URL explicitly and remove .env and storage/ after a run

**Context**: Issue #29 (2026-10-30) generated a migration with `yarn db:generate` against a throwaway database and ran upload tests in a fresh worktree.

**Problem**: `yarn mercato …` copies `.env.example` to `packages/app/.env` when none exists; that file points at the dev database on 5432, so a later command without an explicit `DATABASE_URL` reaches the wrong database. Running the app also writes uploaded files to `packages/app/storage/`, which the root `/storage/` ignore rule did not cover.

**Rule**: Pass `DATABASE_URL` explicitly to every `yarn mercato` / `yarn db:generate` call against a throwaway database, then delete the generated `packages/app/.env`. `packages/app/storage/` is ignored since #29; delete it in a worktree before handing back.

**Applies to**: implementation subagents that generate migrations or run upload tests in a worktree.
