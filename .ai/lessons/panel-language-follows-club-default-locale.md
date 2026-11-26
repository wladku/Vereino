---
title: "A browser check switches a signed-in club user's language through the club or person setting, not the locale cookie"
modules: ["club_core", "people"]
areas: ["testing"]
topics: ["i18n", "locale", "browser-evidence"]
---

# A browser check switches a signed-in club user's language through the club or person setting, not the locale cookie

**Context**: #494 took English screenshots of the panel and of `/club/profile` as a fresh club administrator. With the
`locale` cookie, and then with `POST /api/auth/locale`, every "en" screenshot still showed Polish, which cost two extra
evidence runs.

**Problem**: A person whose interface language is "club default" gets the club's `defaultLocale` (club settings,
`club_core.settings`). That setting wins over the platform's cookie and Accept-Language detection on the panel and
member pages. Those switches only work for guests and on pages without a club person (the public pages, as in
TEST-R10 and TEST-R16).

**Rule**: To render a signed-in club user's pages in a given language, set the club's `defaultLocale` through
`PUT /api/club_core/settings`, using the `updatedAt` lock token from the GET (`updateClubSettings` in
`_fixtures/members.ts`, or `page.request` after `signInBrowser`). Alternatively, set the person's own language through
`PUT /api/people/me`. Check one screenshot per locale before trusting a batch. A test that loops over locales asserts
`<html lang>` after every navigation: `uiText()` patterns match both catalogs, so a pass that silently rendered the
other language still passes (TEST-C12 set only the cookie in its loops until #641).

**Timing (#818)**: the platform's `detectLocale` reads the `locale` cookie first on every request, so the club or
person language takes effect when the user signs in, not on the next page load. E27-S01 changed the club's
`defaultLocale` to `pl` after `signInBrowser` and the panel stayed `lang="en"`; setting the `locale` cookie after the
sign-in switched it. To change the language mid-test, sign in again after the setting change or set the cookie after
the sign-in, and assert `<html lang>` either way.

**Applies to**: integration tests and evidence scripts under `packages/app/.ai/qa/`, agent-browser checks of `/backend`
and `/club` pages in both locales.
