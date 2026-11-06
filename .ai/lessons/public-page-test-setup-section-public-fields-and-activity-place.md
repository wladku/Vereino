---
title: "Set a section's public fields through its public endpoint, and give a test activity a place"
modules: ["club_core", "activities"]
areas: ["testing"]
topics: ["integration-tests", "public-pages", "fixtures", "validation"]
---

# Set a section's public fields through its public endpoint, and give a test activity a place

**Context**: The E06-S07 test (#89) failed twice in its own setup before reaching the behaviour under test. Each failure cost a full integration run (build + Testcontainers, several minutes):

- First, `POST /api/club_core/sections` with `shortDescription` answered 400 `unrecognized_keys`.
- Then, `POST /api/activities/activities` without `placeId` answered 400 `invalid_type`.

**Problem**: The section create schema is `.strict()` and holds only the internal fields. The tile text (`shortDescription`) and every other public field belong to `sectionPublicSchema`, written by `PUT /api/club_core/sections/{id}/public`. An activity (series or event) always needs a bookable place.

**Rule**: In integration tests:

- Set `shortDescription`, `isPublic`, `publicSlug` and the other public section fields with `putSectionPublic` (`_fixtures/publication.ts`).
- Create a place first (`create(request, token, 'places', { name, kind: 'hall' })`) and pass `placeId` to `createActivity` / `createEvent`.
- Before the first integration run, check a new test's setup calls against the Zod schemas in the module's `data/validators.ts`.

**Applies to**: `packages/app/.ai/qa/tests/**`, `club_core/data/validators.ts` (`sectionPublicSchema`), `activities` activity creation.
