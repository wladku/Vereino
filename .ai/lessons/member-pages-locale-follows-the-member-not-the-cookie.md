---
title: "A test switches a member page's locale through the member's locale, not the cookie alone, and asserts html lang"
modules: ["people", "payments"]
areas: ["testing"]
topics: ["i18n", "locale", "integration-tests", "member-shell"]
---

# A test switches a member page's locale through the member's locale, not the cookie alone, and asserts html lang

**Context**: #595 made `TEST-C13-cash-and-coach-pages` run M-15 and M-18 in `en` and `pl` by setting the `locale` cookie before each pass, as `TEST-C12-guardian-orders-on-the-phone` does. The `en` pass failed on `<html lang>`: `/club` rendered English, but after a click and a reload the coach page was Polish.

**Problem**: The member shell (`people/components/club/ClubFrame.tsx`, `useMemberLocale`) writes the member's resolved locale — the person's `preferred_locale`, then the club's `default_locale` (DD-34, `memberLocale`) — into the `locale` cookie and refreshes the page. A cookie that disagrees with it holds only until the shell's first effect, so a pass "in English" can silently render Polish. `uiText()` patterns match the English and the Polish text alike, so the text assertions still pass and the test proves nothing about the second locale.

**Rule**: To run a member page in a locale, set what the member's locale resolves from — the club's `defaultLocale` (`updateClubSettings`) when the member has no preferred locale, or the person's `preferredLocale` — together with the cookie, and assert `await expect(page.locator('html')).toHaveAttribute('lang', locale)` after each navigation. When the administrator signs into the browser later in the test, update the token used for the settings call (lesson `sign-in-browser-ends-the-api-token`).

**Applies to**: integration tests under `packages/app/.ai/qa/tests` that loop over locales on `/club/**` pages; `openIn` in `payments/TEST-C11-payer-page-m08.spec.ts` and `payments/TEST-C13-cash-and-coach-pages.spec.ts` is the reference. `TEST-C12-guardian-orders-on-the-phone` sets only the cookie in its loops, so its `pl` pass probably renders English.
