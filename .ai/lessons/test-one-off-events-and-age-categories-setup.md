---
title: "Create matches and sparrings through the activities route, and seed the age categories before reading them"
modules: ["activities", "groups"]
areas: ["testing"]
topics: ["integration-tests", "fixtures", "events", "age-categories", "dictionaries"]
---

# Create matches and sparrings through the activities route, and seed the age categories before reading them

**Context**: TEST-N14 (#263) needed one-off tournaments, a sparring and a match, and a team with an age category. Two runs failed on setup, not on the feature: `POST /api/activities/events` answered 422 `event_type_not_allowed` for `sparring`, and `GET /api/groups/options/age-categories` returned `{ items: [] }` for a club made by `createClub`.

**Problem**: The events route (`createEvent`) takes only `tournament` and `other`; a `match` or `sparring` is an activity played against an opponent. And a new test club has no age-category dictionary — it is created by the seed, not by club creation — so the options list is empty.

**Rule**: Create one-off tournaments with `createEvent` (`startsAt`, `endsAt`; past dates are accepted). Create a one-off match or sparring with `createActivity` without `recurrenceRule`, with `opponentExternalTeamId` from `POST /api/groups/external-teams` and `startsOn`/`startTime`/`endTime`. Call `seedAgeCategories(club)` before `ageCategoryOptions` in any test that needs a category.

**Applies to**: `packages/app/.ai/qa/tests/_fixtures/activities.ts` (`createEvent`, `createActivity`), `_fixtures/groups.ts` (`seedAgeCategories`, `ageCategoryOptions`); tests of public events, team cards and age categories.
