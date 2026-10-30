# Issue #29 — public club and section pages, publication blocks and logos (club spec phase 1 steps 6 and 7)

- **Date:** 2026-10-30
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` (installed from `open-mercato/skills`, repo-local override applied; feature route) with one implementation subagent and the coordinator's own review and gate
- **Trigger:** product owner — "/om-auto-fix-issue 21"; #21 is the E02 epic, the owner chose #29 ("#29 strony publiczne") and approved migrations without new packages ("Migracje, bez nowych pakietów")
- **Spec / issue / branch:** `.ai/specs/2026-10-20-vereino-club-management.md` phase 1 steps 6 and 7 (REQ-025, REQ-028; DD-23, DD-28, DD-29, DD-35; TEST-037 for the `club_core` blocks, TEST-040); issue #29 (epic #21); branch `feat/issue-29-public-pages`
- **Status:** completed — PR open for review

## Goal

A guest opens the club's public page and a section's page without signing in and sees only the blocks the club publishes; the club and each section show their logo, the section logo replacing the club logo; nothing of another club or of a non-public section can be reached.

## Steps

1. Read #21 and its open stories; recommended #29 over #28 (the import needs an XLSX dependency, none installed). Owner chose #29 and approved migrations; no dependency and no new module.
2. Claimed #29 (assignee, `in-progress`, 🤖 comment); worktree from `main` (f23faf8).
3. Subagent: FR triage (no public field, route, page, logo or publication feature existed; the coordinator's `club_core.sections.public_content` grant in the role catalogue, the scope primitives, `attachments`, `LanguageSwitcher`, `FileUploadArea` and the AppShell `logo` prop were reused), then the data model and migration, commands, the public-site DI service, routes, backend panels, public pages, the headers and integration tests.
4. Coordinator review: no dependency or `yarn.lock` change, no module enabled; the slug lookup is one parameterized, index-backed `select` in `data/queries.ts` called only from `services/public-site.ts`, and every later query carries the found tenant and organization; public file reads name the exact owner, assignment and private partition; the migration only adds nullable or defaulted columns, two partial unique indexes and one table, with `lock_timeout` and a hand-written `down()`; logo and material commands go through `authorizeScoped`; `yarn verify` and the whole integration suite rerun by the coordinator.

## Decisions

- Block ownership (DD-28): `club_core` owns `description` (the description half of `description_schedule`), `conditions`, `materials` and `contact` (with the club's own phone); `groups.publicCatalog` and `activities.publicSchedule` (classes, schedule, instructors under `coaches`), `payments.publicPrices` (`prices`) and `facilities.publicPlaces` (`places_calendar`) plug in later. A provider is read with `hasRegistration` and called only when its block is published; a key colliding with a `club_core` block is ignored; a failing provider's block is left out; an enabled block with no content is absent.
- Slugs: trimmed and lower-cased, `^[a-z0-9]+(-[a-z0-9]+)*$`, 3–60 characters (400 otherwise); the club slug is globally unique and the section slug unique among the club's live sections, both 409 `public_slug_taken` from the unique index, so DD-35 stays one query; publishing needs the club slug (422 `publication_slug_required`), a public section its slug (422 `section_public_slug_required`).
- 404s: one body, 404 `public_page_not_found`, for an unknown slug, a non-public, inactive, deleted or another club's section, an internal or unpublished material and a missing logo; a club whose page is off answers 404 `public_page_disabled` with no club data (it reveals only that the slug is taken), and the page says the club does not publish one.
- Rate limits (V-10): 120 per minute per client IP on every public route (S8.6), one key prefix per route, `Cache-Control: public, s-maxage=60`.
- Uploads: logos PNG, JPEG or WebP up to 2 MB; materials PDF or image up to 10 MB (the spec gives no limit); the format is read from the bytes.
- Undo: `logos.set` and `materials.create` are not undoable (their bytes are not in the stored input, as in the platform's documents module); `logos.remove`, `materials.update/delete` and `sections.update_public` are; earlier files are kept so an undo finds its file.
- `publication` in `PUT /api/club_core/settings` also needs `club_core.publication.manage` (403 `publication_forbidden`); the section edit page now needs `club_core.view`, so a coordinator reaches the public panels, while the core form and the coordinators panel keep `club_core.manage`.

## Installed behaviour that differed from the spec

- `attachmentService.readScoped` needs a principal of the file's organization, and the public partition does not serve tenant-scoped rows to guests (`attachments/lib/access.ts`); public routes read with a synthetic principal of the slug-derived scope and the exact owner, assignment and partition (`club_core/api/public-shared.ts`).
- `ScopedAttachmentUploadService.upload` adds the owner assignment itself, so logos and materials use distinct assignment types.
- The platform serves a PDF as `application/octet-stream`; materials keep the type checked from their bytes.
- Images cannot be re-encoded (S8.11) without declaring `sharp` (a new dependency); logos and materials are served as uploaded with `nosniff`.
- The platform's organization branding (`Organization.logoUrl`, `auth/lib/backendChrome.tsx`) takes precedence over the AppShell `logo` prop in `/backend`.
- `OM_INTEGRATION_TEST` disables rate limits, so the 429 is declared and documented, not tested.
- `attachmentService` has no custom-field write, so materials are a module-owned link table written through `persistLink` (the platform documents module's pattern) instead of attachments with a custom `is_public` field.

## Files changed

- `packages/app/src/modules/club_core/{data,migrations,lib,commands,services,api,backend/club/publication,backend/club/sections/[id]/edit/page.meta.ts,components,frontend/p,acl.ts,events.ts,di.ts,i18n,README.md}` — publication, public content, logos, materials, public site and pages
- `packages/app/src/app/(backend)/backend/layout.tsx` — club logo in the staff header
- `packages/app/src/modules/people/{services/club-clock.ts,services/member-profile.ts,api/me/route.ts,components/club/member-client.ts,components/club/ClubFrame.tsx}` — additive `club.logoUrl` for `/club`
- `packages/app/.ai/qa/tests/{_fixtures/publication.ts,club_core/TEST-037-public-blocks.spec.ts,club_core/TEST-040-logos.spec.ts,club_core/E02-S05-public-isolation.spec.ts,club_core/E02-S05-public-pages.spec.ts}` — tests
- `.gitignore` — `packages/app/storage/` (uploads written by the running app)
- `.ai/specs/2026-10-20-vereino-club-management.md` — notes under phase 1 steps 6 and 7, changelog
- `.ai/lessons.md`, three lessons; `.ai/runs/2026-10-30-issue-29-public-pages.md` — this log

## Commands and results

- `yarn verify` — 13/13 passed (subagent's final run from a clean state: Jest 12 suites, 116 tests; `test:scripts` 106 tests); coordinator's rerun: 13/13 passed.
- `yarn test:integration:vereino` (whole suite) — 65/65 passed in the subagent's run (16.8 min); coordinator's rerun: 65/65 passed (15.6 min).
- `yarn db:generate` against a throwaway pgvector container (port 55439, removed afterwards); up, down, up as raw SQL there, then a second `db:generate` with no changes; `EXPLAIN` of the slug lookup shows an index scan on `club_core_club_settings_public_slug_unique`. No `yarn db:migrate`.

## Open problems

- S8.11: uploaded images are not re-encoded (needs `sharp`, Ask First), and published materials (REQ-025) are user files served to others by design. Product owner, 2026-10-30: "Accept for now" — served as uploaded, checked by their bytes, with `nosniff`; revisit before adding `sharp`.
- Deferred to phase 2 step 9: public group fields, `groups.publicCatalog`, `activities.publicSchedule`, the instructors block and `publish_name_consent_at` (DD-29); prices (phase 4) and facility blocks (phase 5).
- Markdown in the public description (rendered as plain text, no markdown dependency); the section logo next to groups in the `groups` pages; clean-up of logo and material files no longer referenced.

## Next steps

- Owner review of the PR.
- Phase 2 step 9 plugs the groups and schedule providers into the DD-28 contract.
