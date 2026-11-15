# Vereino — parity II: navigation, shells and naming

**Date**: 2026-11-14
**Status**: Ready for implementation — approved by the product owner on 2026-11-15 ([owner decisions on #251](https://github.com/wladku/Vereino/issues/251#issuecomment-6891956957), answering the [pre-implementation audit](https://github.com/wladku/Vereino/issues/251#issuecomment-6891759309)): the six Ask First items approved, Q-N01…Q-N03 answered, A-N01…A-N17 confirmed, the audit gaps (c1)–(c6) fixed in this text; phase 1 partly built with #246. Phase 6's two payments counts wait for spec C (REQ-C09)

> Use `om-spec-writing` for every new application, multi-module feature, or other non-trivial business slice. Keep every section below; write `N/A — {reason}` when a section does not apply. Change the status to `Ready for implementation` only after every blocking open question is resolved and the traceability table covers every requirement.

Sources: the parity audit of 2026-11-14 (the application on `main` at `a312199` against the clickable mockup, the specifications and `docs/ux-concept/README.md`); the owner's decisions D-029 (phone first), D-030 (the administrator does the treasurer's work) and D-031 (the mockup is the model for layout and names); issue #246 (the Club group is missing from the sidebar). Design authority: the mockup `docs/ux-concept/mockups/app.ts` (`backendShell`, `memberShell`, `publicShell`, `screenProfile`, `screenLogin`, `screenDashboard`) and its catalogs `docs/ux-concept/mockups/i18n/pl.json` and `en.json`.

This spec is an addendum to `.ai/specs/2026-10-20-vereino-club-management.md` (the club spec), which owns the navigation of every role (`2026-10-27-vereino-facilities.md:137` and `2026-10-27-vereino-club-payments.md:124` both point there). It does not change that spec's status or phases. Ids carry the letter **N** (`REQ-N01`, `DD-N01`, `J-N01`, `TEST-N01`, `AC-N01`, `Q-N01`, `V-N01`), so they never collide with the club spec's ids (D-028).

It is one of five specs of 2026-11-14. The other four cite two parts of this one and do not repeat them:

- **"Glossary (D-031 §2)"** — the rename table;
- **"Menu structure"** — the panel sidebar, the member bottom bar and the More list.

**Rows of the club spec this spec supersedes** (the club spec's body is not edited; see `.ai/specs/changelog/2026-10-20-vereino-club-management/2026-11-14-parity-n.md`):

| Club spec section | Row or sentence | Superseded by |
|---|---|---|
| *UI and Interaction Contracts*, route table | `/backend/club/settings` and `/backend/club/publication`: "`CrudForm` (`pageContext: 'settings'`)" | REQ-N01: both are pages of the Club group in the main sidebar (D-031 §1) |
| same | `/backend/activities/policies`: "`DataTable`, `CrudForm` (`pageContext: 'settings'`)" | REQ-N01: a page of the Classes group; the attribute was never built and must not be added |
| same | `/backend/club/institutions` and `/backend/club/contracts` as two menu pages | REQ-N02: one menu item "Institutions and contracts" with two tabs |
| same | "`/backend/communication/threads` (+ `[id]`), `/backend/communication/cases`" as two menu pages | REQ-N02: one menu item "Threads and cases" with two tabs |
| *UI architecture*, role table | the column "Navigation groups in order" of the rows Guardian / participant, Coach / instructor, Coordinator, Facility attendant, Administrator and Treasurer; the Coordinator row's flow "sign-in → dashboard → widget" | *Menu structure* below (REQ-N01, REQ-N05, REQ-N06, REQ-N08) |
| *UI architecture*, paragraph "Member shell (E06-S19, #101; README 3.1)" | "A bottom bar Today · Calendar · Messages · [a fourth tab a later module grants: Payments (phase 4) or Facilities (phase 5)] · More"; "More opens Profile, the admin panel (only for a `club_admin` or `coordinator` context …) and Sign out"; "the role-context switcher … for a person with the `coach` context" | REQ-N05, REQ-N06, REQ-N07 |
| *UI architecture*, paragraph "Redirect after sign-in" | "an account whose user is linked to a person … lands on `/club`" | REQ-N08: the landing table |

## TLDR

The application has the mockup's screens but not its frame. This spec gives the three shells the mockup's shape and gives every thing one name:

- **Panel.** Six sidebar groups in the mockup's order (Club, People, Classes, Communication, Finance, Facility) with the mockup's items. The Club group is visible again and holds Settings and Publication. Five pages become pages with tabs (B-07, B-18, B-26, B-27, and B-28 with "Rented hours"). Four menu items carry a count. The top bar links to the member interface. The dashboard greets the person and shows each role its widgets.
- **Member pages.** One bottom-bar rule on every page; a More list that reaches every member page; a default context that fits a coach-only person; a staff context for the coordinator; a landing page per role.
- **Public pages and sign-in.** The header Club · Sections · Facilities · Events · Sign in on every public page, "Events" only when the club publishes them; the club's matches, tournaments and camps on their own page (P-06) instead of the club and section pages; the club's logo and name on the sign-in page.
- **Names.** One glossary — mockup term ↔ application term ↔ catalog areas — applied to the seven module catalogs and kept by a check.
- **Leftovers** of the club, people, communication and public screens that no other spec owns, plus loading skeletons and empty states.

Everything reuses what is installed: `page.meta.ts`, the platform's `overrides.nav.groupOrder`, its nav badge store, the `Tabs` primitive in the pattern of `groups/components/GroupsNav.tsx`, `memberNav` of `@vereino/ui`, `/api/auth/feature-check`, and the module catalogs. No migration, no new module, no new dependency.

## Problem Statement

The owner compared the running sandbox with the mockup and found it short "in every area" (D-031). The audit confirmed that the frame is where the two differ most. Verified in the code at `a312199` (module paths are under `packages/app/src/modules/`):

- **The Club group is invisible (#246).** `club_core/backend/club/publication/page.meta.ts` declares `pageContext: 'settings'`. The settings-prefix rule then treats the parent path `/backend/club` as a settings area and drops Sections, Places, Institutions and Contracts from the main sidebar. The rule exists twice: in `packages/app/src/app/(backend)/backend/layout.tsx` (`collectStaticSettingsPathPrefixes`) and in the platform (`@open-mercato/ui/src/backend/utils/nav.ts:248-267`). `AppShell.tsx:600` prefers the platform's answer from `/api/auth/admin/nav` once it has loaded.
- **The sidebar has other groups, names and order.** No page sets a group order. Today's groups are "Grupy" and "Harmonogram" instead of one "Zajęcia", and "Wiadomości", "Płatności" and "Obiekty" instead of "Komunikacja", "Finanse" and "Obiekt". The facility group has twelve items; the mockup has six.
- **Tabs are missing where the mockup has them.** Institutions and Contracts, and Threads and Cases, are separate pages with no link between them. Zones, Closures and Rates are three menu pages; Log, Incidents, Bans and Maintenance are four.
- **No counts, no way back.** No menu item shows a count. The panel has no link to `/club`.
- **The member bottom bar changes from page to page.** `memberNav` gets its fourth tab only from the frame that owns it (`payments/components/club/PaymentsClubFrame.tsx:147-150`, `facilities/components/club-places/FacilitiesClubFrame.tsx:122-123`). The `people`, `activities` and `communication` frames pass none (`ClubFrame.tsx:99`, `ActivitiesClubFrame.tsx:97`, `MessagesClubFrame.tsx:123`). Payments appears and disappears.
- **Five member pages have no entry point.** More holds Profile, My units, Admin panel and Sign out (`packages/ui/src/member/member-nav.ts`). Nothing outside their own module links to `/club/places`, `/club/facility`, `/club/orders`, `/club/coach/payments` or `/club/cash`.
- **A coach-only person starts in an empty view.** `DEFAULT_MEMBER_CONTEXT` is `member` for everyone, and the switcher is offered to anyone who coaches (`packages/ui/src/member/member-context.ts:25-29`). A coordinator has no context at all.
- **Everyone lands on `/club`.** `memberLanding` (`people/lib/member-rules.ts:134`) knows `/club` and `/backend` only. The facility attendant lands on Today, where nothing leads to "Today at the facility".
- **The coordinator's dashboard does not exist.** The club spec promises the coordinator two widgets. Every widget needs `dashboards.view`, which only `club_admin` holds (`packages/core/src/roles.ts:46`).
- **Public pages have no menu.** `club_core/components/public/PublicFrame.tsx:113-131` shows the club link and the language switcher only; `facilities/components/public/PublicFacilitiesFrame.tsx` copies it.
- **Sign-in shows another product.** `packages/app/src/app/login/page.tsx` renders the platform page with the Open Mercato logo, name and "Access your workspace".
- **One thing has two names.** Polish catalogs call the series "Zajęcia" (mockup: "Aktywność"), a place "Obiekt" ("Miejsce"), a booking request "Wniosek" ("Zgłoszenie"), an incident "Zdarzenie" ("Incydent") and the rental price list "Stawki najmu" ("Cennik wynajmu"). "Obiekty" names both the places page and the facility group.

Who has it: every role. The administrator cannot find where to enter the club's places; a parent loses the Payments tab; a coach cannot reach the facility calendar; the attendant cannot reach their only screen.

## Overview and Success Measures

- **Primary outcome:** every page of the application is reachable from its shell's navigation by a person who may open it, in at most three taps or clicks from the landing page. Today five member pages and four panel pages fail this.
- **Leading indicators:** no row left in the orphan table of *Menu structure*; the sidebar test (TEST-N01) and the member navigation test (TEST-N05) pass for every seeded role; the glossary check reports no retired term.
- **Baseline:** measured by the audit on `a312199`: nine pages unreachable; eight sidebar groups against the mockup's six; twelve facility items against six; five retired Polish terms in about 400 of 4,071 catalog keys (the counts in the glossary).
- **Market / product reference:** the clickable mockup is the reference (D-031). Adopted from Open Mercato: the sidebar, its nav badges and its group-order override as shipped. Rejected: a Vereino sidebar component, because the platform's already orders groups and shows counts.

## Goals

- **REQ-N01** — The panel sidebar shows the groups Club, People, Classes, Communication, Finance and Facility in that order, with the items, names and order of *Menu structure*. The Club group is visible and holds Sections, Places, Institutions and contracts, Settings and Publication (D-031 §1; removes the cause of #246).
- **REQ-N02** — B-07, B-18, B-26 and B-27 are pages with tabs. Each tab keeps its existing route, and the menu has one item per page (D-031 §1). This spec owns the shell and the routing; the tab contents stay with their module specs.
- **REQ-N03** — The menu items Sessions, Bank statements, Order campaigns and Requests show a live count of what waits for the person; zero shows nothing.
- **REQ-N04** — The panel's top bar links to the member interface for a person who has one. The dashboard (B-01) greets the person by first name with today's date, and each role sees the widgets of its features; the coordinator and the attendant can open the dashboard.
- **REQ-N05** — Every member page shows the same bottom bar: Today · Calendar · Messages · a fourth tab chosen by one rule · More.
- **REQ-N06** — More lists every member destination the person may open, so no member page is an orphan (D-029).
- **REQ-N07** — A person who only coaches or coordinates starts in the staff context with no switcher. A person with both sides gets the switcher "as member / guardian" and "as coach" or "as coach / coordinator"; in the member context their calendar (M-03) lists the wards', their own and their coached sessions together, as Today already does. The staff context is the coordinator's context: it tells spec A's pages which staff scopes the person holds (shell only; those pages are spec A).
- **REQ-N08** — Sign-in lands each role on its page: the attendant on `/club/facility`, an administrator without a member role on `/backend`, everyone else on `/club`.
- **REQ-N09** — Every public page has the header Club · Sections · Facilities · Events · Sign in; "Facilities" only while the club publishes facility calendars and "Events" only while it publishes events.
- **REQ-N10** — The sign-in page (M-01) shows the club's logo, name and tagline when the club is known, and Vereino's name otherwise; never the platform's.
- **REQ-N11** — Every text of the application uses the terms of **Glossary (D-031 §2)**; a check in `yarn verify` keeps retired terms out.
- **REQ-N12** — The panel screens B-02 to B-05, B-07, B-09 and B-10 get the mockup's remaining functions listed in *Proposed Solution* (the person record's Charges tab is spec C).
- **REQ-N13** — A guest finds the club's one-off events (matches, sparrings, tournaments, camps) of public groups on their own page P-06 `/p/[clubSlug]/events`: upcoming first, then the last 60 days, with a section filter; the club page (P-01) and section page (P-02) no longer list them. The administrator switches the Events menu and page on or off on B-03 (publication block `events`, default off). A team's group card names its category; a missing section answers with a way back to the club page (owner decision of 2026-10-27, confirmed 2026-11-15).
- **REQ-N14** — The Messages tile of the member Today page (M-02) shows the unread count and the newest unread thread, or "No new messages"; a ward card on the profile (M-10) marks the primary payer.
- **REQ-N15** — Member and public pages load with a skeleton in place of the content, and every empty list names the next action.
- **REQ-N16** — `docs/ux-concept/README.md` §1, §3.1 and §3.2 say what D-029, D-030 and D-031 decided.

## Non-goals

- The contents of the tabs of B-26 and B-27, the facility calendar and the widget "Today at the facility" (spec R, `2026-11-14-vereino-parity-facilities.md`).
- The coordinator's member pages, the "needs a coach" lists on the phone, marking a case and deleting a message on the phone (spec A, `2026-11-14-vereino-parity-groups-and-activities.md`).
- The contents of M-08 and M-15 to M-19, the Charges tab of B-10, the widgets "Bank statements and cash" and "Order campaigns" (spec C, `2026-11-14-vereino-parity-payments.md`). This spec gives those pages their entry points only.
- Role assignment editing, the first administrator, empty pickers with a create link (spec L, `2026-11-14-vereino-people-life-cycle-and-data-entry.md`).
- B-33 "Cash to settle" and its menu item: issue #118. Its place and its count are reserved in *Menu structure*.
- Changing a route path, a feature id or an i18n **key**. Only catalog values, page metadata and navigation change.
- Changing the mockup. The application's texts change, not the mockup's (D-031 §2).
- A separate treasurer navigation: the role stays held back (D-030, #245).
- A notes field on contracts (B-07): it needs a column, and no decision asks for it.
- User-arranged sidebars beyond what the platform already offers; a native app (N02, N12).

## Proposed Solution

**Panel sidebar (REQ-N01).** The platform builds the sidebar from each page's `page.meta.ts`: the group is `pageGroupKey`, the item order inside a group is `pageOrder`, and `navHidden` keeps a page out. Groups are ordered by `overrides.nav.groupOrder` of `packages/app/src/modules.ts` (`@open-mercato/core/src/modules/auth/lib/backendChrome.tsx:216-241` puts the listed ids first, in the given order). V-N02, checked in `@open-mercato/shared/src/modules/overrides.ts:122-131` and its `nav` applier: the override is `overrides: { nav: { groupOrder: [...] } }` on **one** module entry; it prepends the named group ids, in the given order, ahead of every other group (the platform's keep their order after them), as a default beneath role and user sidebar preferences; when two module entries declare it, the later one wins and the platform logs a warning. Vereino declares it on the `club_core` entry only. So the change is metadata only:

- `club_core`: remove `pageContext: 'settings'` from the Settings and Publication pages. With no settings page under `/backend/club`, neither prefix rule hides the group. Set the item order of *Menu structure*; hide Contracts from the menu (it becomes a tab).
- `groups` and `activities` share one group id, `groups.nav.group`, renamed "Zajęcia" / "Classes". `activities` already requires `groups`, so the reference follows the dependency. `activities.nav.group` is retired.
- `communication`, `payments` and `facilities` keep their group ids and get the glossary's names. `facilities` hides six pages from the menu (they become tabs). `people` hides Imports (it becomes a button on B-09).
- `modules.ts` declares the group order once.

**How this relates to #246.** #246 proposes to keep `pageContext: 'settings'` on both pages and to guard the prefix rule in `layout.tsx`. D-031 §1 came later and puts both pages in the Club group, so this spec removes the attribute instead. That alone restores the group, in both prefix rules. Two parts of #246 are still needed and become phase 1 of this spec:

1. **The regression test on the sidebar itself** (TEST-N01), because every existing test opens pages by URL.
2. **A guard against the same trap**: a unit-tested check over the generated backend route metadata that fails `yarn verify` when a Vereino page declares `pageContext: 'settings'` while a regular page lives under the same parent path. A guard in `layout.tsx` alone would not do: `AppShell` replaces the layout's prefixes with the platform's once `/api/auth/admin/nav` answers, and the platform's rule cannot be patched.

#246's third acceptance criterion ("the settings sidebar still lists Club settings and Publication") is superseded: after this spec they are in the main sidebar. If #246 is built first as written, phase 1 still applies and inverts that assertion.

**Pages with tabs (REQ-N02).** The pattern exists: `groups/components/GroupsNav.tsx` and `payments/components/PaymentsNav.tsx` render the platform `Tabs` above the page, each tab is its own route, and the secondary routes are `navHidden`. Four more strips follow it: `ClubInstitutionsNav` (Institutions / Contracts), `ThreadsNav` (All / Cases), `FacilityRulesNav` (Zones / Closures / Rental rates) and `FacilityRecordsNav` (Log / Incidents / Entry bans / Maintenance). A tab the person may not open is not rendered. The first route also accepts the mockup's `?tab=` and redirects to the tab's route, so mockup-style links work. One more strip, `FacilityReportsNav`, joins "Rented hours" to the Municipality report, so the facility group has six items.

**Counts (REQ-N03).** The platform renders a count on a menu item from a client store (`@open-mercato/ui/src/backend/nav/navBadges.ts`, `setNavBadge(href, { count })`) that a headless widget on the spot `backend:nav:badges` fills (`AppShell.tsx:1613`). The module that owns the number mounts one such widget and reads its own API; the source of each count is named in *Business rules*. Counts refresh on navigation and every 60 seconds.

**Top bar and dashboard (REQ-N04).** `packages/app/src/components/BackendHeaderChrome.tsx` shows "Interfejs członkowski" linking to `/club` only when `GET /api/people/me` resolves a person for the signed-in user. The feature `people.self` is not the condition: every administrator holds it through the implied `member` role, including one linked to no person, who would land on `/club`'s "no linked person" notice. The header reads `/api/people/me` once per session (the dashboard greeting reads the same answer); while it loads, on an error, or on 404 `person_not_linked`, the link is not rendered. `packages/app/src/app/(backend)/backend/page.tsx` renders a greeting above the platform `DashboardScreen`. The roles `coordinator` and `facility_operator` gain `dashboards.view` in `packages/core/src/roles.ts` (owner approval of 2026-11-15, Q-N03); each Vereino widget keeps its own feature, so a role sees only its widgets (table in *UI architecture*).

**Member navigation (REQ-N05, REQ-N06).** `memberNav` stays the one definition and gains one input: the person's granted features out of a fixed list. A table of member destinations inside `packages/ui/src/member/member-nav.ts` maps each destination to its route, label key and feature; the bar and the More list are computed from it. A hook `useMemberNavFeatures` in `@vereino/ui` asks `/api/auth/feature-check` once per session (the call `facilities/components/club-places/places-client.ts:376-379` already makes) and every one of the five frames passes the answer, so the bar is the same on every page. No module imports another: the table holds URLs and feature ids, which are strings.

**Context and landing (REQ-N07, REQ-N08).** `member-context.ts` learns the staff context: it is offered for the `coach` or `coordinator` grant, it is the default — without a switcher — when the person has no member side, and its label names the coordinator when the person coordinates. `GET /api/people/me` gains `isParticipant` (read through the existing `groups.membershipContribution`) and lists the `facility_operator` grant among `contexts`. `memberLanding` gets the same facts and returns one of three targets.

**Public header and sign-in (REQ-N09, REQ-N10).** A `PublicHeader` component in `@vereino/ui` replaces the two copied headers. The public frame of every public response gains `club.nav` (which links exist), the way `club.links` was added for #195. The sign-in link carries the club's public slug (`/login?club=<slug>`). The app-owned sign-in route renders the club's logo, name and the tagline above the platform form, reading the club through the existing public lookup; the app catalog overrides the platform's brand keys (`auth.login.brandName`, `auth.login.subtitle`, `auth.login.logoAlt`, `appShell.productName`).

- **The `vereino_club` cookie.** Platform API interceptors cannot change response headers or cookies, so the sign-in request does not set it. The app `/login` wrapper (`packages/app/src/app/login/page.tsx`, its client part) writes it once `?club=<slug>` has resolved, through `GET /api/club_core/public/{clubSlug}`, to a club that publishes its page — before the person signs in. Attributes: value = the public slug; `Path=/`; `Max-Age=31536000` (one year); `SameSite=Lax`; `Secure` whenever the page is served over HTTPS (every deployed environment; only `http://localhost` development omits it). It is not `HttpOnly`, because the client part writes it; it holds only a public slug. The server part of the wrapper reads it with `cookies()` when the URL has no `?club=`. An unknown or unpublished slug writes nothing and shows the neutral page; a cookie whose slug no longer resolves to a published club is ignored and deleted by the wrapper (the same attributes with `Max-Age=0`). Nothing else reads or writes the cookie.
- **The platform card's own logo and brand line (V-N05b).** The platform card hard-codes `src="/open-mercato.svg"` (`@open-mercato/core/src/modules/auth/frontend/login.tsx:355`) and offers no seam to hide or replace it. So the app replaces the file `packages/app/public/open-mercato.svg` with the Vereino mark and overrides the catalog keys `auth.login.brandName`, `auth.login.subtitle`, `auth.login.logoAlt` and `appShell.productName` in the app catalog; the club header of the wrapper sits above the card. No eject.
- **App catalog locales.** The app catalog `packages/app/src/i18n/` holds `de`, `es`, `ko`, `en` and `pl` with the same keys. The new `vereino.*` keys and the `auth.login.*` / `appShell.productName` overrides go into all five files: `pl` and `en` with the mockup's texts, `de`, `es` and `ko` with the **English value** as the stated fallback until a translator supplies one (no Vereino module ships those locales; the platform's own `de`/`es`/`ko` values would otherwise still say "Open Mercato").

**Names (REQ-N11).** Catalog values change; keys do not. The glossary below is the list. A script checks the Polish catalogs for the retired stems listed under *Business rules* ("Retired term"); that list is all it enforces. Rules 1 and 2 of the glossary ("zajęcia" → "aktywność"/"termin", "trener" → "prowadzący") and the wording parts of rules 3–5 depend on meaning, which no stem match can tell, so their oracle is the native-reader review of phase 3, not the script.

**Leftovers (REQ-N12 to REQ-N15).**

| Screen | Change | Builds on |
|---|---|---|
| B-03 | Saving "online booking requests" on while "facility calendars" is off is refused on the field (mockup `form.publication.requestsNeedCalendar`); the rule runs in the settings command, only when either flag changes | `club_core/lib/publication.ts`, `club_core/components/PublicationForm.tsx` |
| B-04 | "Add section" offers an optional coordinator (adult person picker); the section is created first, then the role assignment | `club_core/components/SectionForm.tsx:92-110`, `POST /api/people/role-assignments` |
| B-05 | The coordinator picker lists adults only (`ageFrom=18`, a filter REQ-U01 added); the section's coordinator sees the Coordinators tab read-only; saving Details stays on the record | `club_core/components/SectionCoordinators.tsx:44-52`, `SectionForm.tsx:139, 202` |
| B-07 | Contracts table columns From, Base, Per unit, Match (existing rate fields); each institution row links to its contracts tab filtered by institution, and back | `club_core/components/ContractsTable.tsx` |
| B-09 | Role filter gains the facility attendant; header button "Import" opens `/backend/people/imports` | `people/lib/person-list-filters.ts:11` |
| B-10 | Header "{age} · has an account" (`b.screenPerson.hasAccount`); without `people.pesel.view` the PESEL field is shown empty and disabled with the hint `b.screenPerson.peselHintOther` | `people/components/PersonRecord.tsx` |
| P-06 (new), P-01, P-02, B-03 | P-06 `screenPublicEvents`: hero `p.screenEvents.title` / `subtitle`; section chips (`p.screenEvents.sectionFilter`, `all`); "Upcoming" (`p.screenEvents.upcoming`, soonest first, empty `p.screenEvents.noUpcoming`) and "Past (last 60 days)" (`p.screenEvents.past`, newest first, hidden when empty); each row with the section logo, date and start, place with a map link for an external venue, section and type; the block off → `p.screenEvents.notPublished` with the club page link. P-01 and P-02 drop the events list that #91 put on P-01. B-03 gains the toggle `b.screenPublication.events.label` / `desc`. A team card adds `p.screenSectionPage.category`; a missing section shows `p.screenSectionPage.notFound` with the link `p.screenSectionPage.clubPage` | `club_core/components/public/PublicClasses.tsx:157-197` (the list moves out), `club_core/components/PublicationForm.tsx`, the `activities.publicSchedule` provider of #91 |
| M-02 | Messages tile: unread count, the subject of the newest unread thread as a link to it, `m.screenToday.noNew` when none | `communication/widgets/injection/club-messages/widget.client.tsx` |
| M-10 | The ward card shows the "Primary payer" badge (`m.screenProfile.primaryPayer`) | `people/components/club/ClubProfilePage.tsx` |
| Member and public pages | A skeleton replaces the text `LoadingMessage`; every empty list has an explanation and a next action | `@open-mercato/ui/primitives/skeleton` (used in `facilities/components/club-places/ClubPlacesPage.tsx:12`) |

Screens the audit found matching and this spec leaves alone: B-19, M-06, M-07, M-13, M-14 (their texts still follow the glossary).

### Design Decisions and Alternatives

| Decision | Rationale | Alternative considered | Why rejected / deferred |
|---|---|---|---|
| **DD-N01** Settings and Publication lose `pageContext: 'settings'` and join the Club group | D-031 §1; it removes the cause of #246 in both prefix rules | Keep the attribute and guard `layout.tsx` (#246 as written) | Contradicts D-031 §1; the platform's own prefix rule still hides the group after the chrome payload loads |
| **DD-N02** A tab is a route; the strip follows `GroupsNav` | D-031 §1: "existing routes stay valid as the addresses of the tabs"; links, bookmarks and tests keep working; each tab keeps its own `requireFeatures` | One route with `?tab=` state, as the mockup draws it | Seven list routes would turn into redirects and one page would need the union of four feature gates; `?tab=` is kept as an alias only |
| **DD-N03** Group order through `overrides.nav.groupOrder` in `modules.ts` | The platform's own seam; role and user sidebar preferences still win | `pagePriority` numbers on every page | The platform sorts unknown groups by name; weights per page are fragile |
| **DD-N04** `groups` and `activities` share the group id `groups.nav.group` | One group "Zajęcia"; `activities` requires `groups`, never the reverse | A neutral key in the app catalog | Module catalogs hold only their own prefix; an app-level key would be the first of its kind |
| **DD-N05** Counts come from one headless widget per owning module on `backend:nav:badges` | The nav payload is cached for 30 minutes per user, so a count inside it would be stale (the platform's own note in `navBadges.ts`) | A count field in page metadata | Not offered by the platform |
| **DD-N06** `memberNav` takes granted features; the destination table lives in `@vereino/ui` | One definition, no cross-module import; the five frames cannot drift | Each module injects its own entries through a widget spot | Asynchronous per frame, order hard to guarantee, five frames to coordinate |
| **DD-N07** More stays the menu the bottom bar opens; the profile page gets no second copy of the list | #101 built More as a menu (a native `<details>` disclosure in `member-shell.tsx`) with Profile as its first entry; one place to look | The mockup's "More" section on the profile page | Two lists to keep equal |
| **DD-N08** The staff context is one value covering coach and coordinator | The mockup has two contexts ("as coach / coordinator", "as member / guardian"); a third switch position adds a choice with no use | A separate coordinator context | Hick's law (S7.9); a person who coaches and coordinates wants one work view |
| **DD-N09** Landing reads grants and features, never a role name | DD-06 of the club spec; `memberLanding` stays a pure function | A landing page setting per role | Configuration with one sensible value |
| **DD-N10** Club branding on sign-in comes from the public slug in the link or a remembered-club cookie | Reuses the one approved system-scope lookup (D-024, D-026); adds no new one | Brand by the instance's only club | Needs a new system-scope read (Ask First) |
| **DD-N11** The rename changes catalog values only | Keys, routes and feature ids are contracts (`BACKWARD_COMPATIBILITY.md`); values are not | Rename keys to match (`facilities.requests` → …) | Breaks every consumer for no visible gain |
| **DD-N12** A retired-term check in `yarn verify` | Four other specs add texts in parallel; without a check the old words return | Review only | Already failed once: "Obiekty" was noticed in #246 and left |
| **DD-N13** The rule "online requests need the facility calendar" is enforced only when either flag changes | A stored combination that breaks the rule keeps loading and saving (the path DD-U07 took for section names) | Reject on every save | Breaks an untouched record |

## Domain Vocabulary and Business Rules

### Glossary (D-031 §2)

One word names one thing. The left columns are the mockup's catalogs and are binding; the application's catalog **values** change to them. "Areas" names the catalog areas (the first two key segments) to review, with the number of keys found on `a312199` by matching the Polish value against the English one. The numbers size the work; they are not a list of edits.

**Rules that decide a case the table does not name:**

1. The series is "aktywność"; one meeting is "termin". "Zajęcia" stays in three uses only: the activity type `classes` ("zajęcia"), "grupa zajęciowa", and the mockup's everyday phrases on Today and in the calendar legend (`m.screenToday.noClassesToday`, `noClassesTomorrow`, `nothingToday`, `ui.timeline.legendSessions`).
2. "Trener" is the role, the contract kind and the member context. "Prowadzący" is the person who runs a given activity or session (field labels, columns, pickers, "no coach"). "Instruktor" labels that person for a class group (`m.screenOccurrence.instructor`). English stays "coach".
3. "Miejsce" is a record in the club's register of places (B-06) and every field or picker that points at one. "Obiekt" is the facility as the facilities module shows it: the group "Obiekt", the tab "Obiekty", "Kalendarz obiektu", "Dziś na obiekcie". English: "place" and "facility".
4. "Zgłoszenie" is an outside booking request; "rezerwacja" is a club booking; "wynajem" is the paid rental. The noun "zgłoszenie" is not used for anything else.
5. The menu label and the page title may differ where the mockup differs (short in the menu, full on the page).

**Panel groups and menu items**

| Thing | Mockup PL | Mockup EN | Application today (PL / EN) | Keys and areas |
|---|---|---|---|---|
| Group: club | Klub | Club | Klub / Club | `club_core.nav.group` — no change |
| Group: people | Ludzie | People | Ludzie / People | `people.nav.group` — no change |
| Group: groups, activities, sessions | Zajęcia | Classes | two groups: Grupy / Groups and Harmonogram / Schedule | `groups.nav.group` (renamed, shared), `activities.nav.group` (retired) |
| Group: threads | Komunikacja | Communication | Wiadomości / Messages | `communication.nav.group` |
| Group: money | Finanse | Finance | Płatności / Payments | `payments.nav.group` |
| Group: facility | Obiekt | Facility | Obiekty / Facilities | `facilities.nav.group` |
| Places page (B-06) | Miejsca; "Dodaj miejsce" | Places; "Add place" | Obiekty; "Dodaj obiekt" / Places | `club_core.places.*` (23), `club_core.errors` (6), `club_core.audit` (5) |
| Institutions and contracts (B-07) | Instytucje i umowy; tabs Instytucje, Umowy | Institutions and contracts | two items: Instytucje, Umowy | `club_core.institutions.title`, new tab labels |
| Settings (B-02) | menu: Ustawienia; page: Ustawienia klubu | Settings; Club settings | Ustawienia klubu | `club_core.settings.title` + a menu label |
| Publication (B-03) | menu: Publikacja; page: Publikacja strony klubu | Publication; Club page publication | Publikacja strony klubu | `club_core.publication.title` + a menu label |
| Activities (B-13, B-14) | Aktywności; "Nowa aktywność"; "Kreator aktywności" | Activities; New activity; Activity wizard | Zajęcia; "Nowe zajęcia" / Activities | `activities.activities.*` (20), `activities.policies` (6), `payments.fees` (5), `communication.audience`, `communication.scope`, `club_core.settings`, `payments.errors` — 45 keys |
| Sessions (B-15) | Terminy | Sessions | Terminy / Sessions | no change to the title |
| Coach units report (B-16) | Raport jednostek | Coach units report | Raport jednostek trenerów | `activities.reports.coachUnits.title` |
| Threads and cases (B-18) | Wątki i sprawy; tab Sprawy | Threads and cases; Cases | two items: Wątki, Sprawy | `communication.threads.title`, tab labels |
| Fees and discounts (B-20) | Cenniki i zniżki; "Dodaj cennik" | Fees and discounts; Add fee | Składki i zniżki | `payments.fees.title` (the body already says "cennik" in 16 keys) |
| Bank statements (B-29) | Wyciągi bankowe | Bank statements | Wyciąg bankowy / Bank statement | `payments.bank.title` |
| Order campaigns (B-30, B-32) | Zbiórki zamówień; Zbiórka zamówień | Order campaigns; Order campaign | Zamówienia grupowe | `payments.orders.*` (7), `payments.audit` (3) |
| Cash to settle (B-33) | Gotówka do rozliczenia | Cash to settle | not built (#118) | the item's label when #118 lands |
| Facility calendar (B-23) | menu: Kalendarz; page: Kalendarz obiektu | Calendar; Facility calendar | Kalendarz obiektu | a menu label |
| Requests (B-25) | menu: Zgłoszenia; page: Zgłoszenia do akceptacji | Requests; Requests awaiting approval | Wnioski o rezerwację / Booking requests | `facilities.requests.*` (15), `facilities.dashboard` (2) |
| Zones and rates (B-26) | menu: Strefy i cennik; page: Strefy, zamknięcia, cennik; tabs Strefy, Zamknięcia, Cennik wynajmu | Zones and rates; Zones, closures, rates; Rental rates | three items: Strefy, Zamknięcia, Stawki najmu | `facilities.zones.title`, `facilities.rates.*` (12), `facilities.audit` (3), `facilities.errors` (2), `facilities.rentals` (2), `facilities.public` (2) |
| Log and incidents (B-27) | menu: Dziennik i incydenty; page: Dziennik, incydenty, zakazy; tabs Dziennik, Incydenty, Zakazy wstępu, Konserwacja | Log and incidents; Log, incidents, bans | four items: Dziennik obiektu, Zdarzenia, Zakazy wstępu, Konserwacja | `facilities.records.*` |
| Municipality report (B-28) | Raport dla gminy | Municipality report | same | no change |

**Things and states**

| Thing | Mockup PL | Mockup EN | Application today (PL / EN) | Keys and areas |
|---|---|---|---|---|
| The recurring series | aktywność | activity | zajęcia / activity | as "Activities" above |
| One meeting | termin | session | "termin" in lists, "zajęcia" elsewhere / session | 160 keys where English says session or class: `activities.club` (37), `activities.errors` (14), `activities.dashboard` (12), `activities.notifications` (8), `club_core.public` (8), `activities.linkRequest` (5), `activities.reports` (5), `activities.activities` (5), `facilities.*` (21), others (45) — apply rule 1 |
| The person running it | prowadzący ("Prowadzący domyślny", "— bez prowadzącego —", "Zmień prowadzącego") | coach | trener / coach | `activities.fields` (5), `activities.substitutions` (11), `activities.occurrences` (3), `activities.conflicts` (2), `activities.activities.columns.coach`, `activities.club.session.coach`, `activities.club.calendar.coach` — apply rule 2 |
| The role | trener; instruktor | coach; instructor | same | no change |
| Activity type `other` | wydarzenie | event | Inne / Other | `activities.types.other` |
| Activity type `sparring` | sparing | friendly | Sparing / Sparring | `activities.types.sparring` (English) |
| A register entry | miejsce | place | obiekt / place | 63 keys where English says place: `club_core.places` (23), `facilities.reports` (7), `club_core.errors` (6), `facilities.records` (6), `club_core.audit` (5), `facilities.email` (5), `facilities.facility` (3), `people.errors` (2), others (6) |
| The facility on member and public pages | obiekt; Obiekty; Obiekty klubu | facility; Facilities; Club facilities | same | 81 keys stay — rule 3 |
| An outside booking request | zgłoszenie; "Zgłoś rezerwację"; "Zgłoszenia rezerwacji online" | request; Request a booking; Online booking requests | wniosek; "Złóż wniosek o rezerwację"; "Wnioski online" / request | 49 keys: `facilities.public` (21), `facilities.requests` (15), `facilities.places` (3), `club_core.places` (3), `club_core.publication` (2), `facilities.dashboard` (2), others (3) |
| The noun "zgłoszenie" used for something else | — | — | 13 keys in `activities.audit`, `activities.declarationLink`, `activities.linkRequest`, `activities.notifications`, `activities.club` | reword with the verb ("zgłoś nieobecność") or the mockup's own text for that screen — rule 4 |
| Rental status `pending_verification` | czeka na potwierdzenie e-mail | awaiting e-mail confirmation | Czeka na weryfikację e-maila | `facilities.rentals.status.*` |
| Rental status `pending_approval`; the tab | czeka na akceptację; Czekają na akceptację | awaiting approval | Czeka na zatwierdzenie; Do zatwierdzenia | `facilities.rentals.status.*`, `facilities.rentals.tabs.*` |
| Rental status `requested` | zaakceptowany — czeka na wpłatę | approved — awaiting payment | Zgłoszony / Requested | `facilities.rentals.status.requested`, `facilities.public.state.requested*` — ends the two meanings of "requested" |
| No-show | nie stawił się; action "Nie stawił się" | no-show | Niestawienie się; action "Nie przyszli" | `facilities.rentals.status.no_show`, `facilities.facility.noShow.*` |
| An incident | incydent; "Zgłoś incydent" | incident; Report incident | zdarzenie; "Zgłoś zdarzenie" / incident | 29 keys: `facilities.records` (11), `facilities.facility` (10), `facilities.audit` (3), `facilities.reports` (3), `facilities.errors` (2) |
| The rental price list | cennik wynajmu | rental rates | stawki najmu / rental rates | 22 keys, listed under B-26 |
| Zone kinds | ogólnodostępne; treningi klubu; do rezerwacji; zamknięte (`ui.zoneLabel.*`) | open to public; club training; bookable; closed | "Publiczna, bezpłatna", "Do rezerwacji, płatna" … | `facilities.zones.*` — applied by spec R with the zones tab |
| Calendar entries of a day | Wpisy dnia (`m.screenPlace.dayEntries`) | Entries for the day | shown inside segments, no heading | spec R (B-23, M-11) |
| A fee schedule | cennik | fee | składka (title only) | `payments.fees.title` |
| A membership fee (the charge) | składka | membership fee | same | no change |
| A kit collection | zbiórka zamówień | order campaign | zamówienie grupowe / order campaign | as B-30 above |

**Member shell, public shell and sign-in**

| Thing | Mockup PL | Mockup EN | Application today (PL / EN) | Keys and areas |
|---|---|---|---|---|
| Bottom bar | Dziś · Kalendarz · Wiadomości · Płatności / Obiekty · Więcej | Today · Calendar · Messages · Payments / Facilities · More | same words; the fourth tab only in its own module | the five copies of the nav labels: `people.club.nav.*`, `activities.club.nav.*`, `communication.club.nav.*`, `payments.club.nav.*`, `facilities.places.nav.*` |
| Context switcher label | Kontekst | Context | Działam jako / Acting as | `*.nav.context` in the five catalogs |
| Member context | jako członek / opiekun | as member / guardian | Opiekun lub członek / Guardian or member | `*.nav.contextMember` |
| Staff context | jako trener; jako trener / koordynator | as coach; as coach / coordinator | Trener / Coach; no coordinator variant | `*.nav.contextCoach`, new `*.nav.contextCoachCoordinator` |
| Today title | Dzień dobry, {name} (`shell.memberShell.greeting`) | Hello, {name} | page title "Dziś" | `people.club.*` |
| More: facilities | Obiekty i rezerwacje | Facilities and booking | no entry | new nav label `facilities` |
| More: attendant | Dziś na obiekcie | Today at the facility | no entry | new nav label `facilityToday` |
| More: orders | Zamówienia (np. stroje) | Orders (e.g. kit) | no entry | new nav label `orders` |
| More: coach payments | Płatności moich grup | My groups' payments | Today tile only | new nav label `groupPayments` |
| More: cash | Przyjmij gotówkę | Accept cash | no entry | new nav label `acceptCash` |
| More: panel | Panel administracyjny | Admin panel | same | no change |
| More: sign out | Wyloguj | Sign out | Wyloguj się | `*.nav.signOut` |
| More: coach units | (README 3.1: "My units") | My units | Moje jednostki | no change |
| Panel → member link | Interfejs członkowski | Member interface | missing | app catalog `packages/app/src/i18n/*.json` |
| Dashboard heading | Dzień dobry, {name}; "{date} · co wymaga dziś działania" | Hello, {name}; "{date} · what needs action today" | platform heading | app catalog |
| Public header | Klub · Sekcje · Obiekty · Wydarzenia · Zaloguj | Club · Sections · Facilities · Events · Sign in | missing | `club_core.public.*`, `facilities.public.*` |
| Sign-in (M-01) | club logo and name; "Jedno konto dla rodzica, zawodnika i trenera"; "Zaloguj"; "Nie pamiętam hasła" | "One account for parents, players and coaches"; "Sign in"; "Forgot password" | Open Mercato logo and name; "Access your workspace" | app catalog overrides of `auth.login.*`, `appShell.productName` |

### Business rules

| Term / invariant | Precise meaning or rule | Source of truth | Failure behavior |
|---|---|---|---|
| Fourth tab | Payments (`/club/payments`) when the person holds `payments.view_own` and is an adult (`paymentsVisible` of `GET /api/people/me`); else Facilities (`/club/places`) when they hold `facilities.view`; else none | `memberNav` | Feature check failed or pending: three tabs and More; no error shown |
| Current tab | Calendar also for `/club/occurrences/**` and `/club/events/**`; Payments also for `/club/orders/**`; More for `/club/profile`, `/club/wards/**`, `/club/facility`, `/club/coach/**`, `/club/cash`, and `/club/places/**` when Facilities is not the fourth tab | `memberNav` | — |
| Member side | The person has a ward, or an active participant membership today (`isParticipant`) | `people` (`groups.membershipContribution.isActiveParticipant`) | Without `groups`: wards only |
| Staff context | Offered when the person's grants include `coach` or `coordinator`. For a person with the `coordinator` grant it is what spec A calls the coordinator context. Default and no switcher when the person has no member side. With a member side: the switcher is shown, the default is the member context, and the last choice is kept in the tab's session storage (as today) | `member-context.ts` | A stored context the person no longer holds falls back to the default |
| Staff scopes | `memberStaffScopes(profile)` returns `coach`, `coordinator` or both, by the person's grants. In the staff context Today and the calendar ask for the coach scope (`as=coach`); what a coordinator sees of the section (`as=coordinator`, by view) is spec A's, which reads this function | `member-context.ts` | — |
| Calendar in the member context | A person with a member side and the `coach` grant gets one list on M-03: the member query (`as=guardian` or `as=self`, with the ward choice) and `as=coach`, merged by start time. A session found by both appears once and opens with `?as=coach`. In the staff context the list holds the staff sessions only. This matches Today, where the member context already shows the "My sessions" tile beside the member tiles | `memberCalendarScopes` (replaces `memberCalendarScope`) | One of the two reads fails: the other list is shown with a retry line |
| Landing | Applied only to the platform's default redirect; an explicit `redirect` is kept (as today). Table in *Menu structure* | `memberLanding` | No linked person: `/backend` with the notice (unchanged) |
| Admin panel entry | Shown in More for the grants `club_admin`, `coordinator` and `facility_operator`. Target `/backend` | `memberNav` | The panel authorizes itself |
| Menu count | **Sessions:** planned sessions without a coach from today on, in the caller's scope — `total` of `GET /api/activities/occurrences?unassigned=1` from today (the B-15 tab). **Bank statements:** transactions `suggested` or `unmatched` — `bank.toDecide` of `GET /api/payments/dashboard`. **Order campaigns:** campaigns `open`, `closed`, `ordered` or `delivered` — `campaigns` of the same route. Both fields arrive with spec C's extension of that route (REQ-C09). **Requests:** rentals `pending_approval` — `total` of `GET /api/facilities/rentals/requests`. **Cash to settle:** with #118. Shown as a number, "99+" above 99, nothing at zero | the owning module's API named here; no new endpoint | A failed read shows no count |
| Tab visibility | A tab is rendered only when the person holds the `requireFeatures` of its route | each route's `page.meta.ts` | Opening the route by URL without the feature: the platform's 403 |
| Settings-page guard | No Vereino backend page may declare `pageContext: 'settings'` while a non-settings static page shares its parent path | `scripts/check-settings-prefixes.mjs` over the generated route metadata | `yarn verify` fails and names both pages |
| Publication rule | `online_requests` may be turned on only when `places_calendar` is on; turning `places_calendar` off turns `online_requests` off in the same save, after a confirmation | `club_core` settings command | 422 `publication_requests_need_calendar` on the field |
| Coordinator must be an adult | The picker offers adults; the role-assignment command refuses a minor. V-N05: the command does not refuse one today and no `role_requires_adult` code exists, so phase 8 adds the code to `people/lib/error-codes.ts` and the check to the command (new, not conditional) | `people` | 422 `role_requires_adult` on the person field |
| Public events (P-06) | One-off activities of public groups in public sections. "Upcoming": end today or later, soonest first. "Past": end before today and start not older than 60 days, newest first, with the "past" badge. Shown only while the publication is enabled **and** the block `events` is on (default off) | `activities` public provider `activities.publicEvents`; `club_core_club_settings.publication.events` | Block off: no "Events" menu item, P-06 shows "Klub nie publikuje wydarzeń", the API returns 404 `public_events_disabled`; no events: the empty text |
| Retired term | A value of a Polish catalog — `packages/app/src/modules/*/i18n/pl.json` and `packages/app/src/i18n/pl.json` — matches one of these case-insensitive patterns in its scope, and the (key, pattern) pair is not in the allow-list `packages/app/scripts/check-glossary.allow.json` (entries `{ "key", "pattern", "reason" }`; a stale entry that no longer matches also fails). The retired list, complete: `wnios` (every key; → "zgłoszenie"); `zdarze` (keys `facilities.*`; → "incydent"); `stawk\p{L}* najmu` (every key; → "cennik wynajmu"); `zamówieni\p{L}* grupow` (every key; → "zbiórka zamówień"); `niestawieni` (every key; → "nie stawił się"); `obiekt` (keys `club_core.places.*`; → "miejsce"); `harmonogram` (keys ending `.nav.group`; → "Zajęcia"). Rules 1–2 of the glossary are not on the list; the native-reader review of phase 3 is their oracle | `packages/app/scripts/check-glossary.mjs` | `yarn verify` fails and names the key, the pattern and the catalog file |

## Users, Permissions, and Scope

No feature id is added. Two roles gain an existing feature.

| Actor | Allowed outcomes | Scope rule | Required feature IDs |
|---|---|---|---|
| Club administrator | The whole sidebar; every tab; all counts; the dashboard with every widget; "Member interface" when `GET /api/people/me` resolves a person | Club-wide | unchanged (`*.` wildcards, `dashboards.view`) |
| Section coordinator | Sidebar: Club (Sections), People, Classes, Communication, Facility (Calendar; Zones and rates read-only, as today); the count on Sessions; the dashboard with "Sessions needing a coach", "Unsettled sessions" and (spec R) "Today at the facility"; the staff context on `/club` | Own sections (unchanged) | **adds `dashboards.view`** to `vereino_coordinator` |
| Coach / instructor | Member pages only; fourth tab Payments (when also a payer) or Facilities; More: My units, Facilities, My groups' payments | Own groups (unchanged) | unchanged |
| Facility attendant | Lands on `/club/facility`; More: Today at the facility, Facilities, Admin panel; sidebar: Facility (Calendar, Rentals, Zones and rates read-only, Log and incidents); the dashboard with "Today at the facility" (spec R) | Assigned places (unchanged) | **adds `dashboards.view`** to `vereino_facility_operator` |
| Guardian, adult participant | Bottom bar with Payments on every page; More: Orders | Own and wards' (unchanged) | unchanged |
| Minor participant with an account | Three tabs and More (Profile, Sign out) | Own (unchanged) | unchanged |
| Maintenance planner | More: Facilities (`/club/places`) | Assigned places (unchanged) | `facilities.maintenance.manage` (unchanged) |
| Guest | Public header; the sign-in page with the club's branding | Public slug | none |

`tenantId` and `organizationId` come from the authenticated context everywhere. The sign-in branding is the only sessionless read; it goes through the existing public club lookup by slug (DD-35, D-024) and returns what `/p/[clubSlug]` already shows: name and logo. Navigation never grants access: an item is shown by feature, and each page and API keeps its own check.

## Reuse and Ownership Map

| Capability | Reuse / extend / app-own | Existing module or new module | Integration seam | Why |
|---|---|---|---|---|
| Sidebar groups, items, order | reuse | platform `auth` nav + each module's `page.meta.ts` | `pageGroupKey`, `pageOrder`, `navHidden`; `overrides.nav.groupOrder` in `modules.ts` | The platform builds the sidebar; no custom component |
| Tab strips | reuse | each owning module (`club_core`, `communication`, `facilities`) | `Tabs` of `@open-mercato/ui`, the `GroupsNav` pattern | Proven on B-11 and B-20 |
| Menu counts | reuse | `activities`, `payments`, `facilities` | headless injection widget on `backend:nav:badges` → `setNavBadge` | The platform's own capability |
| Member interface link, dashboard greeting | app-own | app shell (`packages/app/src/components`, `src/app/(backend)/backend/page.tsx`) | `useBackendChrome` granted features; `GET /api/people/me` | App-owned scaffold files already edited for the club logo |
| Member navigation | extend | `@vereino/ui` (`member-nav.ts`, `member-context.ts`) | pure functions + `useMemberNavFeatures` over `/api/auth/feature-check` | Five frames, one definition |
| Member profile facts | extend | `people` (`GET /api/people/me`) | `groups.membershipContribution` (optional DI, existing) | `people` never imports `groups` |
| Landing | extend | `people` (`member-rules.ts`, `services/member-landing.ts`) | the existing API interceptor on `POST /api/auth/login` | Same seam as today |
| Public header | app-own, shared | `@vereino/ui` (`PublicHeader`), used by `club_core` and `facilities` | props only; `club.nav` in the public frame | Two modules reuse it; neither imports the other |
| Sign-in branding | extend | app route `src/app/login/page.tsx` + `club_core` public lookup | `GET /api/club_core/public/{clubSlug}`; app catalog overrides | The platform page stays the form |
| Role grants | extend | `@vereino/core` (`roles.ts`) | role catalogue → `setup.ts` role features | The single catalogue of role features |
| Catalog texts | extend | all seven Vereino modules + app catalog | `i18n/pl.json`, `i18n/en.json` | Values only |

## Architecture and Data Flow

```text
Panel
  page.meta.ts (group key, order, navHidden) ─┐
  modules.ts overrides.nav.groupOrder ────────┼─> /api/auth/admin/nav -> AppShell sidebar
  widgets on backend:nav:badges -> own list API (pageSize=1) -> setNavBadge(href, count)
  <Module>Nav tab strip -> router.push(tab route)        (?tab= on the first route -> redirect)

Member
  /api/people/me (contexts, wards, isParticipant, paymentsVisible) ─┐
  /api/auth/feature-check (fixed feature list) ──────────────────────┼─> memberNav() -> bottom bar + More
  member-context.ts: roles offered, default, switcher, staff scopes -> Today / calendar queries

Sign-in
  POST /api/auth/login -> people interceptor -> memberLanding(grants, features, member side)
                       -> /club | /club/facility | /backend
  /login?club=<slug> -> app route -> GET /api/club_core/public/<slug> -> logo, name above the platform form

Public
  public API responses -> club { name, slug, logo, contact, links, nav } -> PublicHeader (@vereino/ui)
```

- **Module boundaries:** each module changes its own pages, catalog and widgets. Shared code goes to `@vereino/ui` (navigation, header, skeletons) and `@vereino/core` (role catalogue), which no module owns. `people` reads `groups` through the existing optional contract. `club_core` and `facilities` render the same header from props.
- **Extension points:** page metadata; `overrides.nav.groupOrder`; the spot `backend:nav:badges`; the existing `vereino:club:today:*` spots for Today tiles; the login API interceptor.
- **Alternatives considered:** one route with `?tab=` (DD-N02); injected member nav entries (DD-N06); a settings sidebar for Club (DD-N01).
- **Compatibility:**
  - **Unchanged:** every route path, feature id, i18n key, API route and command id.
  - **Additive:** `isParticipant` and the `facility_operator` value in `contexts` on `GET /api/people/me`; `club.nav` (with `events`) in the public frame; `?club=` on `/login`; `?tab=` aliases; the error code `publication_requests_need_calendar`; two role grants; the public route `GET /api/club_core/public/{clubSlug}/events` and the `activities.publicEvents` contribution; the `events` publication block.
  - **Narrowing:** `GET /api/club_core/public/{clubSlug}` and `/sections/{sectionSlug}` no longer return `events[]` (the list moves to P-06). Only Vereino's own public pages read it, and they change in the same phase. **BC tier:** a response field of a Vereino route, tier "Protected at first deployment" (`BACKWARD_COMPATIBILITY.md`, tier table and §2). Before the first deployment to a shared environment it may be removed in one PR that updates every consumer, with the spec note (this section and *Rollout*) as step 5; the owner approved exactly that on 2026-11-15. `BACKWARD_COMPATIBILITY.md` still lists "confirm that no Railway `staging`/`production` service exists" as an open gap: phase 9 confirms it before merging. If a shared environment is deployed by then, the field stays (empty `events: []`, `deprecated` in `openApi`) for one minor release and is removed after it (the bridge of the default path).
  - **Changed inside the repository:** the `memberNav` input and `MemberShellLabels` of `@vereino/ui` (all five callers change in the same pull request); page metadata; catalog values.
  - **One narrowing:** the publication rule (DD-N13), enforced only on change.

## User Journeys

### Journey J-N01 — The administrator enters the club's first place

1. Aneta signs in. She has no ward and does not train, so she lands on `/backend`. The dashboard says "Dzień dobry, Aneta" with today's date.
2. The sidebar shows Klub first: Sekcje, Miejsca, Instytucje i umowy, Ustawienia, Publikacja. She opens **Miejsca** and adds the pitch.
3. The owner picker needs the municipality. She opens **Instytucje i umowy**, adds it on the Instytucje tab, switches to the Umowy tab and back without leaving the page.
4. Failure: a coordinator opens `/backend/club/contracts` by URL without `club_core.contracts.manage` and gets the platform's 403. A person who may open Instytucje but not Umowy sees the page without the Umowy tab.

### Journey J-N02 — A parent pays from any page

1. Kasia reads a thread on `/club/messages/[threadId]`. The bottom bar shows Dziś · Kalendarz · Wiadomości · Płatności · Więcej, as on every page.
2. She taps **Płatności** and pays. She taps **Więcej** and sees Profil, Zamówienia (np. stroje) and Wyloguj.
3. Her daughter Ola, 14, has three tabs and Więcej: no Płatności, no Zamówienia.
4. Failure: the feature check does not answer. The bar shows three tabs and Więcej with Profil and Wyloguj; the next page load asks again.

### Journey J-N03 — A coach-only person and a coordinator open the app

1. Anna only coaches. She lands on `/club` in the staff context. There is no switcher; Today shows her sessions; the calendar asks for `as=coach`.
2. Her fourth tab is Obiekty, because she has no payments of her own. Więcej lists Profil, Moje jednostki, Płatności moich grup and Wyloguj.
3. Wojtek coaches, coordinates the academy and has a child in the club. He gets the switcher "jako członek / opiekun" · "jako trener / koordynator"; the member context is the default and his last choice is remembered. In the member context his calendar lists his child's sessions and the sessions he coaches in one list. Więcej also lists Panel administracyjny.
4. Failure: Wojtek's coordinator role ends. The stored staff context still fits (he coaches), and the label becomes "jako trener".

### Journey J-N04 — The attendant opens the facility

1. Tomek signs in on his phone and lands on `/club/facility`.
2. The bottom bar shows Dziś · Kalendarz · Wiadomości · Obiekty · Więcej; Więcej is marked current and lists Dziś na obiekcie first after Profil, then Panel administracyjny.
3. He follows a link from an e-mail to `/club/messages/…`; that explicit redirect is kept.
4. Failure: his place assignment ended. `/club/facility` shows its own empty state ("no facility assigned" — spec R); the entry stays, because he still holds the feature.

### Journey J-N05 — A guest goes from the club page to sign-in

1. A parent opens `/p/gwiazda/places`. The header shows the club's logo and name, then Klub · Sekcje · Obiekty · Wydarzenia · Zaloguj ("Wydarzenia" only when the club publishes events).
2. **Sekcje** goes to the sections block of the club page. **Zaloguj** opens `/login?club=gwiazda`.
3. The sign-in page shows the club's logo, "KS Gwiazda" and "Jedno konto dla rodzica, zawodnika i trenera" above the form. Having opened that branded page once, the phone remembers the club (the `vereino_club` cookie) for the next visit to `/login`.
4. Failure: the slug is unknown or the club does not publish a page. The sign-in page shows Vereino's name and the form; no club data is read.

## UI and Interaction Contracts

Closest installed references: `groups/components/GroupsNav.tsx` and `payments/components/PaymentsNav.tsx` (tab strip over routes); `packages/ui/src/member/member-shell.tsx` with `member-nav.ts` (bottom bar and More sheet); `club_core/components/public/PublicFrame.tsx` (public frame); `@open-mercato/ui/src/backend/AppShell.tsx` (sidebar, `NavItemBadge`); `packages/app/src/components/BackendHeaderChrome.tsx` (top bar). `.ai/guides/backend-ui.md` applies; implementation invokes `om-backend-ui-design`. Member and public components follow S7.4 and S7.9 of the engineering standards.

| Surface / route | Purpose and primary actions | Data source / mutations | Closest installed reference | Canonical shell / components | Required states | Requirement IDs |
|---|---|---|---|---|---|---|
| Panel sidebar (every `/backend` page) | Groups, items, order, counts of *Menu structure* | `/api/auth/admin/nav`; count widgets | `AppShell` | platform sidebar; no custom component | loading (platform skeleton), collapsed, narrow (drawer) | REQ-N01, REQ-N03 |
| Panel top bar | "Interfejs członkowski" → `/club` | `GET /api/people/me` (a person resolves) | `BackendHeaderChrome.tsx` | `Button` (link), in the mobile "more" menu under 768 px | hidden while loading, on error and on 404 `person_not_linked` | REQ-N04 |
| `/backend` (B-01) | Greeting, date, widgets per role | `GET /api/people/me`; platform dashboard | `DashboardScreen` | app page + `DashboardScreen` | loading (skeleton line), no linked person (greeting without a name), empty dashboard ("Nothing needs action today") | REQ-N04 |
| `/backend/club/institutions`, `/backend/club/contracts` (B-07) | Tabs Instytucje / Umowy; contracts columns From, Base, Per unit, Match; links between an institution and its contracts | existing CRUD routes; `GET /api/club_core/contracts?institutionId=` (new optional filter) | `GroupsNav.tsx` | `Tabs`, `DataTable` | as today + tab hidden without its feature | REQ-N02, REQ-N12 |
| `/backend/communication/threads`, `/backend/communication/cases` (B-18) | Tabs Wszystkie / Sprawy | existing | `GroupsNav.tsx` | `Tabs`, `DataTable` | as today | REQ-N02 |
| `/backend/facilities/zones`, `/closures`, `/rates` (B-26) | Tabs Strefy / Zamknięcia / Cennik wynajmu | existing | `GroupsNav.tsx` | `Tabs` | as today (contents: spec R) | REQ-N02 |
| `/backend/facilities/logs`, `/incidents`, `/bans`, `/maintenance` (B-27) | Tabs Dziennik / Incydenty / Zakazy wstępu / Konserwacja | existing | `GroupsNav.tsx` | `Tabs` | as today (contents: spec R) | REQ-N02 |
| `/backend/facilities/reports/owner`, `/reports/rented-hours` (B-28) | Tabs Raport dla gminy / Wynajmowane godziny | existing | `GroupsNav.tsx` | `Tabs` | as today | REQ-N02 |
| `/backend/club/publication` (B-03) | The requests toggle depends on the calendar toggle | `PUT /api/club_core/settings` | `PublicationForm.tsx` | `CrudForm` | field error 422, confirmation when the calendar is turned off | REQ-N12 |
| `/backend/club/sections/create`, `[id]/edit` (B-04, B-05) | Optional coordinator on create; adults only; read-only tab for the coordinator; save stays | `/api/club_core/sections`, `/api/people/role-assignments`, `GET /api/people/persons?ageFrom=18` | `SectionForm.tsx`, `SectionCoordinators.tsx` | `CrudForm`, `LookupSelect` | partial success ("Section created; the coordinator was not assigned" + retry on the Coordinators tab), 409 conflict | REQ-N12 |
| `/backend/people/persons`, `[id]` (B-09, B-10) | Role filter value; Import button; header age and account; PESEL hint | existing | `PersonsTable.tsx`, `PersonRecord.tsx` | `DataTable`, `CrudForm` | as today | REQ-N12 |
| Every `/club/**` page | Bottom bar and More | `GET /api/people/me`, `POST /api/auth/feature-check` | `member-shell.tsx` | `MemberShell` | loading (three tabs and More), offline (last known bar), sign-out | REQ-N05, REQ-N06 |
| `/club` (M-02) | Greeting title; context switcher; Messages tile | `GET /api/communication/threads?as=member&unread=1&pageSize=1` (existing filters) | `club-messages/widget.client.tsx` | tile, `StatusBadge` | loading skeleton, no unread ("Brak nowych wiadomości."), error + retry | REQ-N07, REQ-N14 |
| `/club/profile` (M-10) | "Primary payer" badge on the ward card | `GET /api/people/me` | `ClubProfilePage.tsx` | `StatusBadge` | as today | REQ-N14 |
| `/login` (M-01) | Club header above the platform form | `GET /api/club_core/public/{clubSlug}` | platform `auth/frontend/login.tsx` | app route wrapper + platform `LoginPage` | no club (Vereino name), unknown slug (same), loading (name placeholder) | REQ-N10 |
| Every `/p/**` page | Header Klub · Sekcje · Obiekty · Wydarzenia · Zaloguj | `club.nav` of the public response | `PublicFrame.tsx` | `PublicHeader` of `@vereino/ui` | no facilities link when the calendar block is off; no events link when the events block is off; club unknown (title only) | REQ-N09 |
| `/p/[clubSlug]/events` (P-06, new) | Upcoming and past events; section chips in `?section=` | `GET /api/club_core/public/{clubSlug}/events?section=` | new `club_core/frontend/p/[clubSlug]/events/page.tsx`; `PublicClasses.tsx` event card reused | chips, cards, `StatusBadge`, `EmptyState` | loading; no upcoming; past hidden when empty; block off; unknown section → all | REQ-N13 |
| `/p/[clubSlug]`, `/sections/[sectionSlug]` (P-01, P-02) | No events list; category on team cards; 404 with a way back | `GET /api/club_core/public/{clubSlug}` (+ `/sections/{sectionSlug}`) | `PublicClasses.tsx` | cards | 404 | REQ-N13 |
| `/backend/club/publication` (B-03) | Toggle "Menu Wydarzenia" among the blocks | `GET/PUT /api/club_core/settings` (`publication.events`) | `PublicationForm.tsx` | `Switch` with its description | — | REQ-N13 |

### UI architecture

#### Menu structure

**Panel sidebar.** Dashboard first (the platform's item), then six groups in this order. "Feature" is the page's `requireFeatures`, unchanged.

| Group (id) | # | Menu item PL / EN | Route | Feature | Tabs (route, feature) | Count |
|---|---|---|---|---|---|---|
| Klub / Club (`club_core.nav.group`) | 1 | Sekcje / Sections | `/backend/club/sections` | `club_core.view` | — | — |
| | 2 | Miejsca / Places | `/backend/club/places` | `club_core.manage` | — | — |
| | 3 | Instytucje i umowy / Institutions and contracts | `/backend/club/institutions` | `club_core.manage` | Instytucje (same) · Umowy (`/backend/club/contracts`, `club_core.contracts.manage`) | — |
| | 4 | Ustawienia / Settings | `/backend/club/settings` | `club_core.manage` | — | — |
| | 5 | Publikacja / Publication | `/backend/club/publication` | `club_core.manage`, `club_core.publication.manage` | — | — |
| Ludzie / People (`people.nav.group`) | 1 | Osoby / People | `/backend/people/persons` | `people.view` | — (Import: header button → `/backend/people/imports`) | — |
| Zajęcia / Classes (`groups.nav.group`) | 1 | Grupy / Groups | `/backend/groups/groups` | `groups.view` | Grupy · Drużyny zewnętrzne · Sezony (existing `GroupsNav`) | — |
| | 2 | Aktywności / Activities | `/backend/activities/activities` | `activities.view` | — | — |
| | 3 | Terminy / Sessions | `/backend/activities/occurrences` | `activities.view` | — (perspectives of B-15) | sessions needing a coach |
| | 4 | Raport jednostek / Coach units report | `/backend/activities/reports/coach-units` | `activities.reports.view` | — | — |
| | 5 | Polityki deklaracji / Declaration policies | `/backend/activities/policies` | `activities.view` | — | — |
| Komunikacja / Communication (`communication.nav.group`) | 1 | Wątki i sprawy / Threads and cases | `/backend/communication/threads` | `communication.post` | Wszystkie (same) · Sprawy (`/backend/communication/cases`, `communication.cases.manage`) | — |
| Finanse / Finance (`payments.nav.group`) | 1 | Cenniki i zniżki / Fees and discounts | `/backend/payments/fees` | `payments.manage` | existing `PaymentsNav` | — |
| | 2 | Należności / Charges | `/backend/payments/charges` | `payments.view` | — | — |
| | 3 | Wyciągi bankowe / Bank statements | `/backend/payments/bank` | `payments.bank.import` | — | transfers to decide |
| | 4 | Zbiórki zamówień / Order campaigns | `/backend/payments/orders` | `payments.orders.manage` | — | campaigns in progress |
| | 5 | Gotówka do rozliczenia / Cash to settle | `/backend/payments/cash-custody` | `payments.cash.settle` | — (#118) | people holding cash (#118) |
| Obiekt / Facility (`facilities.nav.group`) | 1 | Kalendarz / Calendar | `/backend/facilities/calendar` | `facilities.view` | — | — |
| | 2 | Wynajmy / Rentals | `/backend/facilities/rentals` | `facilities.rentals.manage` | — | — |
| | 3 | Zgłoszenia / Requests | `/backend/facilities/requests` | `facilities.view`, `facilities.rentals.approve` | — | requests awaiting approval |
| | 4 | Strefy i cennik / Zones and rates | `/backend/facilities/zones` | `facilities.view` | Strefy (same) · Zamknięcia (`/closures`) · Cennik wynajmu (`/rates`) | — |
| | 5 | Dziennik i incydenty / Log and incidents | `/backend/facilities/logs` | `facilities.log.write` | Dziennik (same) · Incydenty (`/incidents`, `facilities.log.write`) · Zakazy wstępu (`/bans`, `facilities.incidents.manage`) · Konserwacja (`/maintenance`, `facilities.maintenance.manage`) | — |
| | 6 | Raport dla gminy / Municipality report | `/backend/facilities/reports/owner` | `facilities.reports.view` | Raport dla gminy (same) · Wynajmowane godziny (`/reports/rented-hours`) | — |

Platform groups (media, integrations and the rest) follow the six, as the platform orders them. Specs R and C add no menu item; a new page of theirs is a tab or a record page under one of these items.

**Member bottom bar and More.** One table in `member-nav.ts`; an entry is shown when the person holds its feature.

| Place | Entry PL / EN | Route | Shown when |
|---|---|---|---|
| Tab 1 | Dziś / Today | `/club` | always |
| Tab 2 | Kalendarz / Calendar | `/club/calendar` | always |
| Tab 3 | Wiadomości / Messages | `/club/messages` | always |
| Tab 4 | Płatności / Payments | `/club/payments` | `payments.view_own` and adult |
| Tab 4 (otherwise) | Obiekty / Facilities | `/club/places` | `facilities.view` and no Payments tab |
| Tab 5 | Więcej / More | menu | always |
| More | Profil / Profile | `/club/profile` | always |
| More | Moje jednostki / My units | `/club/coach/units` | `activities.reports.view_own` |
| More | Grupy / Groups | `/club/groups` | `groups.view`; the page and the entry arrive with spec A (REQ-A11): rosters for a coordinator, own groups for a coach |
| More | Obiekty i rezerwacje / Facilities and booking | `/club/places` | (`facilities.view` or `facilities.maintenance.manage`) and Facilities is not tab 4 |
| More | Dziś na obiekcie / Today at the facility | `/club/facility` | `facilities.log.write` |
| More | Zamówienia (np. stroje) / Orders (e.g. kit) | `/club/orders` | `payments.orders.place` |
| More | Płatności moich grup / My groups' payments | `/club/coach/payments` | `payments.groups.view` |
| More | Przyjmij gotówkę / Accept cash | `/club/cash` | `payments.cash.record` |
| More | Panel administracyjny / Admin panel | `/backend` | grant `club_admin`, `coordinator` or `facility_operator` |
| More | Wyloguj / Sign out | `POST /api/auth/logout` | always |

More lists its entries in the order of this table. Spec A's coordinator pages (section sessions by view on the member calendar and sessions pages) are reached from Today and the calendar in the staff context; spec A adds no tab and one More entry, Groups. Spec C adds none: Orders, My groups' payments and Accept cash are the entries above. A later entry of any spec is one row in this table.

**Landing after sign-in** (only when the sign-in answered with the platform default):

| Person | Lands on |
|---|---|
| Account linked to no person | `/backend` with the notice (unchanged) |
| Holds `facilities.log.write`; no ward, no participant membership; no `coach`, `coordinator` or `club_admin` grant | `/club/facility` |
| Holds the `club_admin` grant; no ward, no participant membership, no `coach` grant | `/backend` |
| Everyone else with `people.self` — guardian, participant, coach, coordinator, an administrator who is also a parent or a coach | `/club` |

**Entry points to pages that had none:**

| Page | Entry point after this spec |
|---|---|
| `/backend/club/sections`, `/places`, `/institutions`, `/settings`, `/publication` | Club group (REQ-N01) |
| `/backend/club/contracts` | Umowy tab of B-07 |
| `/backend/communication/cases` | Sprawy tab of B-18 |
| `/backend/facilities/closures`, `/rates`, `/incidents`, `/bans`, `/maintenance`, `/reports/rented-hours` | tabs of B-26, B-27 and B-28 |
| `/backend/people/imports` | "Import" button on B-09 |
| `/club/places`, `/club/places/[placeId]` | the fourth tab, or More → Facilities and booking |
| `/club/facility` | landing; More → Today at the facility |
| `/club/orders` | More → Orders; the M-08 card and the Today tile of spec C |
| `/club/coach/payments` | More → My groups' payments; the existing Today tile |
| `/club/cash` | More → Accept cash (today the administrator only, D-030) |
| `/club/groups` (spec A, REQ-A11) | More → Groups |
| `/club/places/maintenance` (facilities parity spec, REQ-R15) | the "Konserwacja" link on `/club/places` for a maintenance planner (reached through More → Facilities and booking); the maintenance reminder's link |
| `/club/facility/rentals/[id]` (facilities parity spec, REQ-R14) | the Rentals tab of `/club/facility` |
| `/club/profile/leave` (life-cycle spec, REQ-L03) | the profile page |
| `/club` from the panel | "Interfejs członkowski" in the top bar |

**Dashboard (B-01): who sees which widget.** Each widget keeps its feature next to `dashboards.view`; the order is the mockup's (`screenDashboard`).

| # | Widget | Feature | Administrator | Coordinator | Attendant | Owner |
|---|---|---|---|---|---|---|
| 1 | Terminy do obsadzenia / Sessions needing a coach | `activities.view` | yes | own sections | — | built (#95) |
| 2 | Nierozliczone terminy / Unsettled sessions | `activities.view` | yes | own sections | — | built (#95) |
| 3 | Wyciągi i gotówka / Bank statements and cash | `payments.view` | yes | — | — | spec C (REQ-C09) |
| 4 | Zaległości / Overdue | `payments.view` | yes | — | — | built; detail: spec C |
| 5 | Należności bez płatnika / Charges without a payer | `payments.view` | yes | — | — | built; detail: spec C |
| 6 | Zbiórki zamówień / Order campaigns | `payments.orders.manage` | yes | — | — | spec C (REQ-C09) |
| 7 | Zgłoszenia do akceptacji / Requests awaiting approval | `facilities.rentals.approve` | yes | — | — | built (#125) |
| 8 | Dziś na obiekcie / Today at the facility | `facilities.view` | yes | yes | assigned places | spec R |
| 9 | Sekcje bez koordynatora / Sections without a coordinator | `club_core.manage`, `people.view` | yes | — | — | built (#88) |

| Role | Navigation groups in order | Dashboard / injected widgets | Login-to-primary-task flow |
|---|---|---|---|
| Guardian / adult participant | `/club`: Today · Calendar · Messages · Payments · More | Today tiles | sign-in → `/club` → absence on a session (2 taps); any page → Payments (1 tap) |
| Minor participant | `/club`: Today · Calendar · Messages · More | Today tiles | sign-in → `/club` → declaration (2 taps) |
| Coach / instructor | `/club` in the staff context: Today · Calendar · Messages · Payments or Facilities · More | "My sessions" tile | sign-in → `/club` → session → attendance (3 taps); Facilities → place → book (3 taps) |
| Coordinator | `/club` in the staff context (daily work, spec A); panel: Club → People → Classes → Communication → Facility | panel: widgets 1, 2, 8 | sign-in → `/club` → session needing a coach → assign (spec A, 3 taps); More → Admin panel → dashboard |
| Facility attendant | `/club/facility`; More; panel: Facility | panel: widget 8 | sign-in → `/club/facility` → "Open facility" (2 taps) |
| Administrator | panel: Club → People → Classes → Communication → Finance → Facility; `/club` through "Interfejs członkowski" | widgets 1–9 | sign-in → dashboard → widget → queue (3 clicks) |
| Guest | `/p/[clubSlug]`: Club · Sections · Facilities · Events (optional) · Sign in | — | club page → Facilities → place (2 clicks) |

| Surface / widget | Empty state guidance and action | Responsive behavior | Keyboard / focus behavior |
|---|---|---|---|
| Sidebar | A group with no visible item is not rendered | Platform drawer under 768 px | Platform behaviour; a count is read as "{n} waiting" (`aria-label`) |
| Tab strip | A strip with one visible tab is not rendered | Scrolls horizontally under 640 px | Tablist; arrow keys move, Enter opens; focus lands on the page heading after navigation |
| Bottom bar | — | Four or five equal columns; every target at least 48 × 48 px; labels never wrap at 320 px | `aria-current="page"` on the current tab; More is the native disclosure of `member-shell.tsx`, operable with Enter and Space |
| More menu | Never empty (Profile and Sign out are always there) | Opens above the bar; as wide as the screen under 480 px; scrolls inside when it holds more than seven entries | Entries in reading order; Sign out is a form button |
| Context switcher | Not rendered for a single context | Under the page title on the phone | Native `select` with a visible label |
| Messages tile | "Brak nowych wiadomości." + "Wszystkie" link | One column under 640 px | The thread subject is a link; the count is announced with the tile heading |
| Public header | — | Logo and name on the first row, the links on a second row that scrolls under 480 px | `nav` landmark with a label; the current link has `aria-current` |
| Sign-in | Without a club: Vereino's name | The club header stacks above the form | Focus starts in the e-mail field, as today |
| Member lists (rule, REQ-N15) | A sentence saying what is missing and one action that fills it, or a link to the page that does | Skeleton with the shape of the content: tiles on Today, rows on lists, fields on forms | Skeletons are `aria-hidden`; the region has `aria-busy` |

### Panel — one page with tabs (B-07 as the example)

```text
┌──────────────────────────────────────────────────────────────────────┐
│ ☰ KS Gwiazda          Panel › Instytucje i umowy   [Interfejs członkowski] 👤 │
├───────────────┬──────────────────────────────────────────────────────┤
│ Pulpit        │ Instytucje i umowy                    [Dodaj umowę]  │
│ KLUB          │ [Instytucje] [Umowy]                                 │
│  Sekcje       │ ─────────────────────────────────────────────────── │
│  Miejsca      │ Osoba / instytucja   Rodzaj   Od      Podstawa  Za jednostkę  Mecz │
│ ▸Instytucje…  │ Wojtek Malinowski    trener   01.09   1 200 zł  60 zł         80 zł│
│  Ustawienia   │ Gmina Przykładowo    umowa…   01.01   —         —             —    │
│  Publikacja   │                                                      │
│ LUDZIE        │                                                      │
│ ZAJĘCIA       │                                                      │
│  Terminy   ③  │                                                      │
│ KOMUNIKACJA   │                                                      │
│ FINANSE       │                                                      │
│ OBIEKT        │                                                      │
│  Zgłoszenia ② │                                                      │
└───────────────┴──────────────────────────────────────────────────────┘
```

- **Behavior:** a tab change navigates to the tab's route; the page title and the breadcrumb name the page ("Instytucje i umowy"), the tab names the list. The header action belongs to the active tab. `…/institutions?tab=contracts` redirects to `/backend/club/contracts`. Whether the menu item stays marked on a sibling tab route is V-N01.
- **Responsive and accessibility:** the strip is a tablist; the selected tab's `aria-controls` points at the page content, as in `GroupsNav`.
- **Localization:** `club_core.institutions.tabs.*`, `communication.threads.tabs.*`, `facilities.rules.tabs.*`, `facilities.records.tabs.*`, `facilities.reports.tabs.*` in en and pl; texts from the mockup keys `b.screenInstitutions.tab*`, `b.screenThreadsAdmin.tabCases`, `b.screenZones.tab*`, `b.screenLogs.tab*`.
- **Design-system and theming:** the platform `Tabs` (`variant="underline"`); no custom colours; checked in light and dark mode.

### Member — bottom bar and More (every `/club` page)

```text
┌──────────────────────────────┐   ┌──────────────────────────────┐
│ ‹ Wstecz        ⚑ KS Gwiazda │   │                              │
│ Dzień dobry, Wojtek          │   │  Więcej                      │
│ Kontekst [jako trener / ko▾] │   │  Profil                      │
│                              │   │  Moje jednostki              │
│  … page content …            │   │  Obiekty i rezerwacje        │
│                              │   │  Płatności moich grup        │
│                              │   │  Panel administracyjny       │
├──────────────────────────────┤   │  Wyloguj                     │
│ Dziś  Kalend.  Wiad.  Płatn.  Więcej │   └──────────────────────────────┘
└──────────────────────────────┘
```

- **Behavior:** the bar is built once per page from the profile and the feature answer; both are cached for the session and refetched on focus after five minutes. The switcher stays in the member header, where #101 put it. The Today title is the greeting `shell.memberShell.greeting`.
- **Responsive and accessibility:** 375 px is the design width; the bar reflows to 320 px without clipping; targets 48 × 48 px.
- **Localization:** the nav label list of `memberShellLabels` gains `payments`, `facilities`, `facilitiesMore`, `facilityToday`, `orders`, `groupPayments`, `acceptCash`, `groups`, `contextCoachCoordinator`; each of the five module prefixes holds the same values, and a unit test compares them.
- **Design-system and theming:** existing `MemberShell` tokens; light and dark.

### Public header and sign-in

```text
┌──────────────────────────────────────────────────────────────┐
│ ⚑ Gwiazda         Klub·Sekcje·Obiekty·Wydarzenia·Zaloguj PL▾ │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────┐
│            ⚑                 │
│        KS Gwiazda            │
│ Jedno konto dla rodzica,     │
│ zawodnika i trenera          │
│ ┌──────────────────────────┐ │
│ │ E-mail                   │ │   ← the platform form, unchanged
│ │ Hasło                    │ │
│ │ [ Zaloguj ]              │ │
│ │ Nie pamiętam hasła       │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

- **Behavior:** "Sekcje" links to `/p/{slug}#sections`. "Obiekty" is shown when `club.nav.facilities` is true. "Wydarzenia" links to `/p/{slug}/events` and is shown when `club.nav.events` is true. "Zaloguj" links to `/login?club={slug}`. The sign-in route reads the club by slug, or by the cookie `vereino_club` that the `/login` wrapper writes once `?club=` resolved to a published club (the public slug, `Path=/`, one year, `SameSite=Lax`, `Secure` over HTTPS; full rule under *Proposed Solution → Public header and sign-in*). The platform card's own logo and brand line: the app replaces `public/open-mercato.svg` and overrides the catalog keys (V-N05b).
- **Responsive and accessibility:** the header is one `nav` landmark; the logo has the alt text of `m.screenLogin.logoAlt`.
- **Localization:** `club_core.public.nav.*`, `facilities.public.nav.*` (same values), app catalog `auth.login.*` overrides and `vereino.login.tagline`.
- **Design-system and theming:** existing public tokens; light and dark; the logo keeps its aspect ratio.

## Data Models

N/A — no entity, column or index changes. The spec changes page metadata, catalog values, role features and read models:

| Read model | Change | Owner |
|---|---|---|
| `GET /api/people/me` | `isParticipant: boolean` (additive); `contexts` may contain `facility_operator` | `people` |
| Public frame `club` of every public response | `nav: { sections: boolean, facilities: boolean, events: boolean }` (additive) | `club_core`; `facilities` and `activities` pass it through as they pass `links` |
| `GET /api/club_core/public/{clubSlug}` and `/sections/{sectionSlug}` | `events[]` is no longer returned (the P-01 list moves to P-06); `club.nav.events`; group cards gain `ageCategory` for teams | `club_core` |
| `GET /api/club_core/public/{clubSlug}/events?section=` (new) | `{ club, upcoming: [...], past: [...] }`, each event with `past`, `sectionLogo`, place and `mapUrl` for an external venue | `club_core` route, events through a new `activities.publicEvents` contribution |
| `GET /api/communication/threads` (member) | no change: the tile reads it with the existing `as=member&unread=1&pageSize=1` and shows `total` and the first row | `communication` |

## API, Command, and Error Contracts

One new route, `GET /api/club_core/public/{clubSlug}/events` (REQ-N13, owner decision of 2026-10-27). Changed behaviour:

| Method / command | Path / ID | Auth and feature gate | Input | Success response / event | Errors and concurrency | Requirement IDs |
|---|---|---|---|---|---|---|
| `GET` | `/api/people/me` | auth + `people.self` | — | adds `isParticipant`; `contexts` with `facility_operator` | unchanged | REQ-N07, REQ-N08 |
| `POST` (interceptor) | `/api/auth/login` → `people.member-landing` | — | the sign-in answer | `redirect` = `/club`, `/club/facility` or `/backend` | an explicit redirect is kept; any failure keeps the platform's answer | REQ-N08 |
| `PUT` | `/api/club_core/settings` (`publication`) | `club_core.publication.manage` | the publication blocks | saved | 422 `publication_requests_need_calendar` on `online_requests` when turned on without `places_calendar`; 409 on a stale `updatedAt` (unchanged) | REQ-N12 |
| `GET` | `/api/club_core/public/{clubSlug}` (+ section) | none (public) | — | `club.nav` (with `events`), `ageCategory`; no `events[]` | 404 unchanged | REQ-N09, REQ-N13 |
| `GET` (new) | `/api/club_core/public/{clubSlug}/events` | none (public); rate limit as the other public routes | `section` (slug, optional; unknown → all) | `{ club, upcoming, past }` | 404 `public_events_disabled` while the publication or the block is off; 404 unknown club | REQ-N13 |
| `PUT` | `/api/club_core/settings` (`publication`) | `club_core.publication.manage`, as the other publication blocks | `publication.events` boolean (additive; default false) | saved | unchanged | REQ-N13 |
| `GET` | `/api/facilities/public/…` (every public route, including request verification) | none | — | returns the `club` frame with `nav` whenever the club is resolved | unchanged | REQ-N09 |
| `GET` | `/api/people/persons` | `people.view` | `role=facility_operator` | filtered list | 400 for an unknown role (unchanged) | REQ-N12 |
| `GET` | `/api/club_core/contracts` | `club_core.contracts.manage` | optional `institutionId` | filtered list | 400 for a malformed id | REQ-N12 |
| `POST` | `/api/people/role-assignments` | `people.roles.manage` | coordinator for a minor | — | 422 `role_requires_adult` on `personId` (new code; V-N05 found none) | REQ-N12 |
| config | `packages/app/src/modules.ts` | — | `overrides: { nav: { groupOrder: [six group ids] } }` on the `club_core` entry only (V-N02) | sidebar order | — | REQ-N01 |
| role catalogue | `packages/core/src/roles.ts` | — | `dashboards.view` on `coordinator` and `facility_operator` | added to the `auth` roles by the existing role sync (additive only) | — | REQ-N04 |

All routes keep their per-method `metadata` and OpenAPI schemas; the additive fields are added to the schemas. `BACKWARD_COMPATIBILITY.md` is read before each of these changes.

## Events, Jobs, Notifications, and Cross-Module Flows

N/A — no event, job or notification is added or changed. E-mail and notification **texts** change with the glossary (catalog values in `activities.notifications`, `facilities.email`, `payments.email`); their keys, triggers and recipients do not. Counts are read on the client and are not events.

## Security, Privacy, and Compliance

- **Authorization:** navigation shows an entry by feature and never replaces a check. Every page keeps `requireFeatures`, every API its gate. The feature check a member page makes names a fixed list of feature ids and returns only which of them the caller holds.
- **New grants:** `dashboards.view` for the coordinator and the attendant opens the dashboard page only. Each Vereino widget needs its own feature and reads through scoped APIs; the platform's own widgets need features these roles do not hold. TEST-N04 asserts both.
- **Tenant isolation:** unchanged. The landing reads the signed-in user's own person and grants. The sign-in branding reads one public club by slug through the approved lookup and returns name and logo only.
- **Sensitive data:** the `vereino_club` cookie holds a public slug only (`Path=/`, one year, `SameSite=Lax`, `Secure` over HTTPS; written by the `/login` wrapper, see *Public header and sign-in*). `isParticipant` describes the caller. The PESEL field shown disabled carries no value and no "has a PESEL" flag.
- **Abuse and failure modes:** an unknown `?club=` slug shows the neutral page and does not say whether a club exists (same answer as an unpublished club). `?tab=` is matched against a fixed list. A forged More entry leads to the page's own 403.

## Integration Coverage

| Test ID | Level | Setup / fixture | Actions | Assertions | Requirement IDs |
|---|---|---|---|---|---|
| TEST-N01 | UI | The example club; one user per role: administrator, coordinator, attendant | Open `/backend`; read the sidebar (not URLs) in pl and en | Administrator: the six groups in order with the items of *Menu structure*; Club lists Sekcje, Miejsca, Instytucje i umowy, Ustawienia, Publikacja; no settings sidebar on `/backend/club/settings`. Coordinator: Club lists Sekcje only; no Finance group. Attendant: Facility only. Fails on `a312199` | REQ-N01 |
| TEST-N02 | unit | `scripts/check-settings-prefixes.mjs` with fixture route lists | A settings page beside a regular page under one parent; a settings page alone; a path ending in `settings` | The first fails and names both pages; the others pass; 100 % coverage | REQ-N01 |
| TEST-N03 | UI | Administrator; a test user with `club_core.manage` and without `club_core.contracts.manage` | Open each of the five tabbed pages; switch every tab; open `…?tab=` aliases; open a tab route by URL without its feature | The URL is the tab's route; the title names the page; the alias redirects; a tab without its feature is absent and its URL answers 403; axe clean | REQ-N02 |
| TEST-N04 | integration + UI | One session without a coach, two bank transactions to decide, one open campaign, one request awaiting approval; a coordinator of another section | Open `/backend` as administrator, as each coordinator and as attendant; as an administrator linked to no person | Counts 1, 2, 1, 1 on the four items (the bank and orders counts once spec C's REQ-C09 is built); the other coordinator sees no count; zero shows nothing. Dashboard: the widgets of the role table and no other; greeting with the first name and today's date. "Interfejs członkowski" for each linked user, not for the administrator linked to no person | REQ-N03, REQ-N04 |
| TEST-N05 | unit | `packages/ui/src/member/member-nav.ts` | Every combination of the feature list, adult flag, grants and path | The fourth tab rule, the More list and order, the current marks of *Business rules*; 100 % coverage | REQ-N05, REQ-N06 |
| TEST-N06 | UI | Guardian, minor participant, coach-only, coach + coordinator + guardian, attendant, maintenance planner | At 375 px, in pl and en, light and dark: open one page of each member module; open More; follow every entry | The same bar on every page; each entry opens its page (200, not 403); no page of the orphan table is unreachable; targets ≥ 48 px; no horizontal scroll at 320 px | REQ-N05, REQ-N06 |
| TEST-N07 | unit + UI | `member-context.ts`; a coach with a ward whose group he also coaches | Profiles: coach-only, coordinator-only, coach with a ward, coach who is a participant, guardian only; stored choices that no longer fit. In the browser at 375 px: open the calendar in each context | Roles offered, default, switcher presence, label key, staff scopes, calendar scopes; 100 % coverage. Member context: the ward's and the coached sessions in one list, the shared session once; staff context: coached sessions only | REQ-N07 |
| TEST-N08 | integration | The same six users plus an administrator with no member side, one with a ward, and an account linked to no person | `POST /api/auth/login` with and without an explicit redirect | The landing table; an explicit redirect is kept; `GET /api/people/me` returns `isParticipant` and the `facility_operator` context | REQ-N07, REQ-N08 |
| TEST-N09 | UI | A published club with the calendar block on, one with it off, an unpublished club | Open every public page type, including the request-verification page; follow each header link; open `/login?club=` with a known, an unknown and an unpublished slug, then `/login` again after a sign-in | Header on every page; "Obiekty" only with the block on; sign-in shows the club's logo, name and tagline for the known slug and the neutral page otherwise; the known slug writes `vereino_club` with `Path=/`, `SameSite=Lax` and a one-year expiry, the unknown and unpublished slugs write none; the cookie brands the later visit; "Open Mercato" appears nowhere on `/login` (text and logo `src` content); 375 px, both locales | REQ-N09, REQ-N10 |
| TEST-N10 | unit | `packages/app/scripts/check-glossary.mjs` | Catalog fixtures with each pattern of the retired list, in and out of its key scope; an allow-listed (key, pattern); a stale allow-list entry; a clean catalog | Fails with the key, the pattern and the file for each in-scope match and for the stale entry; passes for out-of-scope and allow-listed values; 100 % coverage. The real catalogs pass | REQ-N11 |
| TEST-N11 | unit | The five module prefixes of the member nav labels | Compare values per key in pl and en | Equal in all five | REQ-N05, REQ-N11 |
| TEST-N12 | integration | A club with the calendar block off; a stored setting that already breaks the rule | Turn requests on; save the stored setting untouched; turn the calendar off with requests on | 422 `publication_requests_need_calendar`; the untouched save succeeds; both flags end off | REQ-N12 |
| TEST-N13 | UI | Administrator; a section coordinator; a minor and an adult person; a facility attendant | Add a section with a coordinator; search the coordinator picker; open the section as its coordinator; save Details; filter people by the attendant role; open a person record with and without `people.pesel.view`; follow institution ↔ contracts links | The assignment exists; the minor is not offered and a forged request answers 422; the Coordinators tab is read-only; the save stays on the record; the filter lists the attendant; header shows age and account; the PESEL field is disabled with the hint | REQ-N12 |
| TEST-N14 | integration + UI | A public section with a tournament 30 days ago, one 90 days ago and one next week, a second public section with a sparring; a non-public group with a match; a team group with an age category | Turn the events block on; open P-06, filter by the first section; open P-01 and P-02; turn the block off and reload; open a missing section | P-06 lists next week's tournament and the sparring under "Upcoming" and the 30-day one under "Past", never the 90-day one or the non-public match; the filter leaves the first section's two; P-01 and P-02 list no events; with the block off the header has no "Wydarzenia", P-06 shows "Klub nie publikuje wydarzeń" and the API answers 404 `public_events_disabled`; the card names the category; the 404 offers "Strona klubu" | REQ-N09, REQ-N13 |
| TEST-N15 | UI | A guardian with two unread threads, then none; a ward whose primary payer she is | Open `/club` and `/club/profile` at 375 px | Tile: count 2 and the newest subject linking to the thread; then "Brak nowych wiadomości."; the ward card shows the badge | REQ-N14 |
| TEST-N16 | UI | Slow responses (route delay) and empty fixtures | Open Today, Messages, Payments, Facilities, a public page | A skeleton, never the text "Loading…"; each empty list shows its sentence and action; `aria-busy` while loading | REQ-N15 |

The tests live in `packages/app/.ai/qa/tests/` and run with `yarn test:integration:vereino`; unit tests run with `yarn test` and `yarn test:scripts`. UI tests pick tabs by role and never by `data-testid` on `TabsTrigger` (lesson `tabs-primitives-drop-data-testid`). Existing tests that assert a renamed Polish text or the old sidebar are updated in the phase that changes it.

## Implementation Phases

Validation for each phase: `yarn verify`, the phase's tests, and `yarn generate` after any `page.meta.ts`, widget or `modules.ts` change. Every UI phase closes in the browser in both locales, light and dark, at 375 px for member and public pages and at 1280 px for the panel. No phase has a migration.

Order against the other four specs: phases 1 to 3 come first, because specs A, R and C add pages under this menu and texts in this vocabulary. Phase 5 comes before spec A's phase 8 (the coordinator on the phone), which reads the staff context. The payments counts of phase 6 follow spec C's dashboard route extension (REQ-C09). Phases 6 to 11 depend on no other spec.

### Phase 1 — Sidebar structure and the Club group (closes #246)

- **Depends on:** none
- **Outcome:** J-N01 steps 1–2; the sidebar equals *Menu structure* except for tabs.
- **Why this order / value delivered:** release-blocking defect; every later phase assumes this menu.
- **Deliverables:**
  - `club_core/backend/club/{settings,publication}/page.meta.ts`: remove `pageContext`; `pageOrder` of the five items;
  - `groups`, `activities`: the shared group key and orders; `people`, `communication`, `payments`, `facilities`: orders; menu labels and group names (the glossary's first table) in the seven catalogs;
  - `packages/app/src/modules.ts`: `overrides: { nav: { groupOrder: [...] } }` on the `club_core` entry only (V-N02, answered under *Proposed Solution*);
  - `scripts/check-settings-prefixes.mjs` as a `yarn verify` step, with unit tests;
  - menu label versus page title where they differ (V-N03);
  - People → Imports keeps its menu item until Phase 8 adds the "Import" button on B-09, so the page never loses its entry point.
- **Independent slices / estimated commits:** (a) page metadata and group order; (b) the guard script; (c) the sidebar test — 3 commits.
- **Requirements closed:** REQ-N01
- **Tests:** TEST-N01, TEST-N02
- **Exit gate:** TEST-N01 fails on `main` and passes on the branch; #246 is closed by the pull request.

### Phase 2 — Pages with tabs

- **Depends on:** Phase 1
- **Outcome:** J-N01 step 3; the facility group has six items.
- **Deliverables:** the five strips (`club_core/components/ClubInstitutionsNav.tsx`, `communication/components/ThreadsNav.tsx`, `facilities/components/FacilityRulesNav.tsx`, `FacilityRecordsNav.tsx`, `FacilityReportsNav.tsx`) mounted on their pages; `navHidden` on the secondary routes; `?tab=` aliases; tab label keys; V-N01.
- **Independent slices / estimated commits:** one per module — 3 commits.
- **Requirements closed:** REQ-N02
- **Tests:** TEST-N03
- **Exit gate:** each tab reachable in two clicks from the dashboard; spec R can fill B-26 and B-27 tab contents without touching the shell.

### Phase 3 — The glossary in the catalogs

- **Depends on:** Phase 1 (menu labels already moved)
- **Outcome:** no retired term in any Polish text; English follows the mockup where it differed.
- **Deliverables:** value changes in `i18n/pl.json` and `i18n/en.json` of the seven modules by the three glossary tables and rules 1–5; `packages/app/scripts/check-glossary.mjs` with its allow-list `packages/app/scripts/check-glossary.allow.json` as a `yarn verify` step, enforcing exactly the retired list of *Business rules* (the script joins the unit-coverage list of `AGENTS.md` like `check-settings-prefixes.mjs`); updated test expectations; the fallback strings in code (`translate(key, fallback)`, `pageTitle`, `pageGroup`) follow the English catalog.
- **Independent slices / estimated commits:** (a) `activities`, `groups`, `communication`; (b) `club_core`, `people`, `payments`; (c) `facilities`; (d) the check — 4 commits, mergeable as up to three pull requests when the diff is large.
- **Requirements closed:** REQ-N11
- **Tests:** TEST-N10, TEST-N11
- **Exit gate:** the check passes on the real catalogs; a native reader reviews the Polish diff of each module once. That review is the oracle for glossary rules 1–2 and the wording parts of rules 3–5, which the check cannot see; the pull request records who reviewed which module.

### Phase 4 — Member bottom bar and More

- **Depends on:** none (best after Phase 3 for the labels)
- **Outcome:** J-N02; J-N04 step 2; no member orphan.
- **Deliverables:** `packages/ui/src/member/member-nav.ts` (destination table, `features` input, current rules), `useMemberNavFeatures`, new label keys; the five frames pass the same input and drop their own `extraTab`; V-N04.
- **Independent slices / estimated commits:** (a) `@vereino/ui` with unit tests; (b) the five frames and catalogs — 2 commits.
- **Requirements closed:** REQ-N05, REQ-N06
- **Tests:** TEST-N05, TEST-N06, TEST-N11
- **Exit gate:** TEST-N06 at 375 px in both locales and both modes.

### Phase 5 — Context default, staff context and landing

- **Depends on:** Phase 4
- **Outcome:** J-N03, J-N04 step 1.
- **Deliverables:** `member-context.ts` (member side, staff context, label, `memberStaffScopes`, `memberCalendarScopes`) and the merged list in `activities/components/club` (the calendar client); `people/api/me/route.ts` (`isParticipant`, the `facility_operator` context in `people/lib/member-rules.ts`); `memberLanding` and `services/member-landing.ts`; "Admin panel" for the attendant; Today's greeting title.
- **Independent slices / estimated commits:** (a) context; (b) landing — 2 commits.
- **Requirements closed:** REQ-N07, REQ-N08
- **Tests:** TEST-N07, TEST-N08
- **Exit gate:** a coach-only user's first calendar shows their sessions; a coach with a ward sees both in one list; spec A's phase 8 (the coordinator on the phone) can start, because it reads `memberStaffScopes`.

### Phase 6 — Top bar link, dashboard frame and menu counts

- **Depends on:** Phase 1; the role grants were approved by the owner on 2026-11-15 (Q-N03); the payments counts depend on spec C (REQ-C09)
- **Outcome:** the coordinator's and attendant's dashboard; four counts.
- **Deliverables:** `BackendHeaderChrome.tsx` (link, shown when `GET /api/people/me` resolves a person); `app/(backend)/backend/page.tsx` (greeting); `packages/core/src/roles.ts` (two grants) and the role sync; `packages/core/src/__tests__/roles.test.mjs:59` inverted (it asserts today that `vereino_coordinator` lacks `dashboards.view`) plus the same assertion for `vereino_facility_operator`; `packages/app/src/modules/activities/README.md:169` rewritten (it says the coordinator has no `dashboards.view` under D29; now the coordinator sees the two widgets for their own sections); count widgets `activities/widgets/injection/nav-badge-sessions`, `payments/widgets/injection/nav-badge-bank`, `nav-badge-orders`, `facilities/widgets/injection/nav-badge-requests` with their `injection-table.ts` rows. The two payments counts read fields that spec C adds to `GET /api/payments/dashboard` (REQ-C09), so that slice follows spec C's phase. Issue #260 carries this: AC-N03's bank-statement and order-campaign counts close only after spec C's REQ-C09; #260 can merge with the sessions and requests counts and leave those two open.
- **Independent slices / estimated commits:** (a) link and greeting; (b) grants; (c) counts, one per module — 5 commits.
- **Requirements closed:** REQ-N03, REQ-N04
- **Tests:** TEST-N04
- **Exit gate:** each role's dashboard matches the role table.

### Phase 7 — Public header and sign-in branding

- **Depends on:** none
- **Outcome:** J-N05.
- **Deliverables:** `packages/ui/src/public/PublicHeader.tsx`; `club.nav` in `club_core/services/public-site.ts` and in the `facilities` and `activities` public responses, including request verification; both frames use the header; `packages/app/src/app/login/page.tsx` wrapper with the club header and the `vereino_club` cookie it writes and reads (attributes under *Proposed Solution*); V-N05b's answer: `packages/app/public/open-mercato.svg` replaced by the Vereino mark, and the app catalog overrides `auth.login.brandName`, `auth.login.subtitle`, `auth.login.logoAlt` and `appShell.productName` plus the new `vereino.login.tagline`, in all five app locales (`de`, `es` and `ko` with the English value as the stated fallback).
- **Independent slices / estimated commits:** (a) header; (b) sign-in — 2 commits.
- **Requirements closed:** REQ-N09, REQ-N10
- **Tests:** TEST-N09
- **Exit gate:** no public page without the header; no "Open Mercato" on `/login`.

### Phase 8 — Club and people panel leftovers

- **Depends on:** Phase 2 (B-07 links)
- **Deliverables:** the B-03, B-04, B-05, B-07, B-09 and B-10 rows of *Proposed Solution*; `publication_requests_need_calendar` in `club_core/lib/error-codes.ts`; the contracts `institutionId` filter; the new `role_requires_adult` in `people/lib/error-codes.ts` with its check in the role-assignment command (V-N05: neither exists today).
- **Independent slices / estimated commits:** (a) publication rule; (b) sections; (c) people and contracts — 3 commits.
- **Requirements closed:** REQ-N12
- **Tests:** TEST-N12, TEST-N13
- **Exit gate:** the five screens match the mockup functions listed.

### Phase 9 — Public events and member tiles

- **Depends on:** Phase 7 for the "Wydarzenia" header link (`PublicHeader`, `club.nav`); P-06 itself and the member tiles do not wait
- **Deliverables:** the P-06, P-01, P-02, B-03, M-02 and M-10 rows of *Proposed Solution*; the `events` publication block (stored in the existing `publication` JSON, no migration); the route `GET /api/club_core/public/{clubSlug}/events`; the `activities.publicEvents` contribution; the "Wydarzenia" header link driven by `club.nav.events` (the header itself is phase 7); the removal of `events[]` from the public club and section responses under the BC rule of *Architecture → Compatibility* (confirm before merging that no shared environment is deployed); a release-note line: clubs that showed events on the club page lose that list on deploy until an administrator turns the `events` block on (it is off by default, owner decision 2026-11-15).
- **Independent slices / estimated commits:** (a) public pages; (b) member tiles — 2 commits.
- **Requirements closed:** REQ-N13, REQ-N14
- **Tests:** TEST-N14, TEST-N15
- **Exit gate:** both at 375 px in both locales and modes.

### Phase 10 — Skeletons and empty states on member and public pages

- **Depends on:** Phase 4
- **Deliverables:** `packages/ui/src/member/member-skeleton.tsx` (tiles, rows, form) on `@open-mercato/ui/primitives/skeleton`; replace `LoadingMessage` on `/club/**` and `/p/**` pages of the five modules; an empty-state sentence and action for each list of those pages that lacks one.
- **Independent slices / estimated commits:** one per module — 5 commits.
- **Requirements closed:** REQ-N15
- **Tests:** TEST-N16
- **Exit gate:** no `LoadingMessage` import under any `components/club*` or `components/public*` folder.

### Phase 11 — README corrections (docs)

- **Depends on:** Phases 1, 2, 4, 5 (it describes them)
- **Deliverables:** `docs/ux-concept/README.md`: §1 device column (coordinator: phone for daily work, desktop for configuration; treasurer: role held back, the administrator does the work; attendant: phone), §3 diagram and §3.1 tables replaced by *Menu structure*, §3.2 folded-surface paragraph (tabs of B-07, B-18, B-26, B-27, B-28), B-02 (slug, phone and description are on B-03), B-21 (the perspective list as spec C defines it), M-01 (club branding, landing table).
- **Requirements closed:** REQ-N16
- **Tests:** none (docs); `yarn verify` link and format checks
- **Exit gate:** the README names no navigation this spec replaced.

## Requirement Traceability

| Requirement | Journey / surface | Data/API/event contracts | Phase | Tests | Acceptance criterion |
|---|---|---|---|---|---|
| REQ-N01 | J-N01; panel sidebar | page metadata, `overrides.nav.groupOrder`, settings-prefix guard | 1 | TEST-N01, TEST-N02 | AC-N01 |
| REQ-N02 | J-N01; B-07, B-18, B-26, B-27, B-28 | tab strips, `navHidden`, `?tab=` | 2 | TEST-N03 | AC-N02 |
| REQ-N03 | sidebar counts | widgets on `backend:nav:badges` | 6 | TEST-N04 | AC-N03 |
| REQ-N04 | top bar; B-01 | role catalogue; `GET /api/people/me` | 6 | TEST-N04 | AC-N04 |
| REQ-N05 | J-N02; every `/club` page | `memberNav`, `/api/auth/feature-check` | 4 | TEST-N05, TEST-N06, TEST-N11 | AC-N05 |
| REQ-N06 | J-N02, J-N04; More | destination table | 4 | TEST-N05, TEST-N06 | AC-N06 |
| REQ-N07 | J-N03; M-02, M-03 header | `member-context.ts`, `isParticipant` | 5 | TEST-N07, TEST-N08 | AC-N07 |
| REQ-N08 | J-N03, J-N04; sign-in | `memberLanding`, login interceptor | 5 | TEST-N08 | AC-N08 |
| REQ-N09 | J-N05; every `/p` page | `club.nav`, `PublicHeader` | 7 | TEST-N09 | AC-N09 |
| REQ-N10 | J-N05; M-01 | app sign-in route, public lookup, app catalog | 7 | TEST-N09 | AC-N10 |
| REQ-N11 | every screen | catalog values, glossary check | 3 | TEST-N10, TEST-N11 | AC-N11 |
| REQ-N12 | B-03, B-04, B-05, B-07, B-09, B-10 | settings command, role assignments, persons list | 8 | TEST-N12, TEST-N13 | AC-N12 |
| REQ-N13 | P-06, P-01, P-02, B-03 | `GET /api/club_core/public/{clubSlug}/events`, `publication.events`, `activities.publicEvents` | 9 | TEST-N14 | AC-N13 |
| REQ-N14 | M-02, M-10 | threads list (`unread=1`), profile | 9 | TEST-N15 | AC-N14 |
| REQ-N15 | member and public pages | `member-skeleton` | 10 | TEST-N16 | AC-N15 |
| REQ-N16 | README | — | 11 | — | AC-N16 |

**Extension surfaces** (`.ai/guides/spec-delivery.md`):

| Surface | Requirement | Reference capability and file | Phase | Test | Classification |
|---|---|---|---|---|---|
| Page metadata of the Vereino backend pages (group key, order, `navHidden`, no `pageContext`) | REQ-N01, REQ-N02 | `ui.page-shell`, `src/modules/example/backend/todos/page.meta.ts`; adapted in every Vereino module | 1, 2 | TEST-N01, TEST-N03 | emitted-example |
| `overrides.nav.groupOrder` in `src/modules.ts` | REQ-N01 | app-level setting read by `@open-mercato/shared/modules/overrides` | 1 | TEST-N01 | framework-only |
| Injection widgets `*.injection.nav-badge-*` on `backend:nav:badges` (four) | REQ-N03 | `umes.injection.rendered-widget`, `src/modules/example/widgets/injection/customer-priority-detail/widget.ts`, mapped in `umes.injection-table`, `src/modules/example/widgets/injection-table.ts`; adapted in Vereino as `payments/widgets/injection-table.ts` | 6 | TEST-N04 | emitted-example |
| API interceptor `people.member-landing` (changed result) | REQ-N08 | `api.interceptors`, `src/modules/example/api/interceptors.ts`; adapted as `people/api/interceptors.ts` | 5 | TEST-N08 | emitted-example |
| `GET /api/people/me` response (two additive fields) | REQ-N07 | existing Vereino route `people/api/me/route.ts` | 5 | TEST-N08 | emitted-example |
| Public frame `club.nav` on public responses | REQ-N09 | `ui.frontend-page`, `src/modules/example/frontend/example.tsx` (the public page family); adapted as `club_core/services/public-site.ts` (`club.links`, #195) | 7 | TEST-N09 | emitted-example |

## Rollout, Migration, and Rollback

- **Migrations:** none.
- **Ask First items (`AGENTS.md`) — all approved by the product owner on 2026-11-15** ([#251 owner decisions](https://github.com/wladku/Vereino/issues/251#issuecomment-6891956957)):
  1. **Role catalogue:** `dashboards.view` for `coordinator` and `facility_operator` (phase 6, Q-N03), including the update of `activities/README.md:169` and `roles.test.mjs:59`. Blocks #260 slice (b) no longer.
  2. **Contract changes, additive:** `isParticipant` and the `facility_operator` context on `GET /api/people/me` and the landing rule change (Q-N02, #259); `club.nav` (with `events`) in the public frame, `?club=` on `/login` and the `vereino_club` cookie (#261); the `institutionId` filter on the contracts list, the error codes `publication_requests_need_calendar` and `role_requires_adult` (new, #262); the public route `GET /api/club_core/public/{clubSlug}/events` with the error code `public_events_disabled`, the `activities.publicEvents` contribution and the `events` publication block (#263). **One narrowing:** the public club and section responses drop `events[]` (P-06 takes the list), allowed in one PR while no shared environment is deployed (BC tier under *Architecture → Compatibility*).
  3. **One narrowing:** the publication rule (DD-N13), enforced only when a flag changes (#262).
  4. **Configuration and tooling:** `overrides.nav.groupOrder` in `modules.ts` and the `check-settings-prefixes` step (#246); the `check-glossary` step (#257).
  5. **`@vereino/ui` public API:** the `memberNav` input, `MemberShellLabels` and `useMemberNavFeatures` (#258); `PublicHeader` (#261); the skeletons (#264).
  6. **The landing rule** for administrators and attendants (Q-N02): it changes where existing users arrive.
- **No new module, no new dependency, no migration** (the owner approved none, and none is needed).
- **Seed and setup:** the role grants reach existing clubs through the existing role sync on deploy; no data change.
- **Release note:** the P-06 `events` block is off by default, so a club that shows events on its club page today loses that list on deploy until an administrator turns the block on in Publication (owner decision 2026-11-15). The note also says how to reset a rearranged sidebar (below).
- **Rollout order:** phases 1–3 in order; the rest independently. Each phase is one pull request (phase 3 up to three).
- **Sidebar preferences:** the group order is a default beneath role and user sidebar preferences. A user who rearranged the sidebar keeps their arrangement; the release note says how to reset it.
- **Nav cache:** the platform caches the sidebar per user for up to 30 minutes and invalidates it by a module-surface fingerprint; a deploy that changes page metadata changes the fingerprint.
- **Rollback (S14.6):** redeploy the previous release. Nothing persistent changes except the two role grants and a stored `publication.events` flag. The role sync (`sync-role-acls`, `defaultRoleFeatures`) only **adds** features (`auth/AGENTS.md`), so a redeploy does not take `dashboards.view` back from `vereino_coordinator` and `vereino_facility_operator`. Accepted: under the previous release the grant opens the platform dashboard page only, whose Vereino widgets still need their own features (the coordinator would then see the two session widgets for their sections, the attendant none). When the grant must go, an administrator removes `dashboards.view` from the two roles in the platform role ACL editor (`/backend/roles`) in each organization; no corrective script is shipped. The previous release ignores the stored `publication.events` flag, the `vereino_club` cookie and the session storage values.
- **Feature flags:** none.

## Risks and Tradeoffs

| Risk / tradeoff | Impact | Mitigation / detection | Residual risk |
|---|---|---|---|
| The menu item is not marked active on a sibling tab route (`/backend/club/contracts` under "Instytucje i umowy") | The person loses their place in the sidebar | V-N01 looks for a platform seam; the breadcrumb and the page title always name the parent page; the same holds today on B-11 and B-20 | Medium until V-N01 is answered |
| A person holds a later tab's feature but not the first tab's (a maintenance planner without `facilities.log.write`) | The menu item is hidden, the tab unreachable from the menu | Such a person works from `/club/places` (D-029), which More now reaches; the administrator holds every feature | Low |
| The rename breaks tests that assert Polish text | Red CI in phase 3 | The phase updates the expectations; the check lists every retired term | Low |
| Parallel specs (A, R, C) add texts with retired terms | The old words return | `check-glossary` in `yarn verify` (DD-N12); phase 3 lands first | Low |
| A user's saved sidebar arrangement hides the new order | "Nothing changed" for that user | Release note; the default applies to everyone who never rearranged | Low |
| `/api/auth/feature-check` slow or failing on a member page | The fourth tab and most of More are missing | The bar renders the three fixed tabs and More at once; the answer is cached per session; TEST-N06 covers the degraded bar | Low |
| A role holds a feature of a disabled module | A More entry that leads to a 404 | V-N04; fallback: the entry also needs its route in the generated frontend route list | Low |
| The platform sign-in card cannot hide its own logo (V-N05b: it hard-codes `/open-mercato.svg`, no seam) | Two logos on `/login` | The app's own `public/open-mercato.svg` carries the Vereino mark and the catalog overrides the name; the club logo sits in the wrapper's header above | Low (cosmetic: the Vereino mark inside the card stays) |
| Administrators now land on `/backend` | An administrator used to `/club` is surprised once | Approved by the owner (Q-N02, 2026-11-15); "Interfejs członkowski" is one click away | Low |
| Clubs that show events on P-01 lose the list on deploy (the `events` block defaults to off) | Guests see no events until the administrator turns the block on | Owner decision 2026-11-15; the release note says it | Accepted |
| `dashboards.view` shows a platform widget to a coordinator | A widget with nothing to show | TEST-N04 asserts the exact widget list per role | Low |
| The club cookie brands `/login` for another club's member on a shared phone | The wrong logo above a working form | Sign-in itself is not club-bound; signing in from the other club's page replaces the cookie | Accepted |

## Acceptance Criteria

- [ ] **AC-N01** — The administrator's sidebar shows, after Dashboard, the groups Klub, Ludzie, Zajęcia, Komunikacja, Finanse and Obiekt in that order with the items of *Menu structure*, in pl and en. Klub lists Sekcje, Miejsca, Instytucje i umowy, Ustawienia and Publikacja. A coordinator sees Sekcje only in Klub and no Finanse. `yarn verify` fails when a settings page shares a parent path with a regular page.
- [ ] **AC-N02** — B-07, B-18, B-26, B-27 and B-28 each open from one menu item and show their tabs; every tab has its own URL; a tab without its feature is absent. The facility group has six items.
- [ ] **AC-N03** — Terminy, Wyciągi bankowe, Zbiórki zamówień and Zgłoszenia show the number of waiting records in the person's scope and nothing at zero. The Wyciągi bankowe and Zbiórki zamówień counts close only after spec C's REQ-C09 (#260 records it).
- [ ] **AC-N04** — The panel's top bar shows "Interfejs członkowski" when `GET /api/people/me` resolves a person for the signed-in user, and not to an administrator linked to no person. The dashboard greets by first name with the date. Administrator, coordinator and attendant each see exactly the widgets of the role table.
- [ ] **AC-N05** — At 375 px, in pl and en, light and dark: every `/club` page of every module shows the same bottom bar for the same person. A guardian sees Płatności on all of them; a coach without own payments sees Obiekty; a minor sees neither.
- [ ] **AC-N06** — At 375 px, in pl and en, light and dark: from More a guardian reaches Orders; a coach reaches My units, My groups' payments and (as tab or entry) Facilities; the attendant reaches Today at the facility; the administrator reaches Accept cash. No member page is reachable only by typing its URL.
- [ ] **AC-N07** — At 375 px, in pl and en, light and dark: a coach-only person opens `/club` and the calendar and sees their sessions without choosing a context; no switcher is shown. A person who coordinates and has a ward sees the switcher with "jako trener / koordynator". A coach with a ward sees, in the member context, the ward's and the coached sessions in one calendar list.
- [ ] **AC-N08** — After sign-in the attendant is on `/club/facility`, an administrator without a member side on `/backend`, every other linked person on `/club`; an explicit redirect is kept.
- [ ] **AC-N09** — Every public page, including request verification, shows the header Klub · Sekcje · Obiekty · Wydarzenia · Zaloguj at 375 px in both locales; "Obiekty" only when the club publishes facility calendars, "Wydarzenia" only when it publishes events.
- [ ] **AC-N10** — `/login?club=<slug>` of a published club shows its logo, its name and "Jedno konto dla rodzica, zawodnika i trenera"; `/login` without a known club shows Vereino's name. Neither shows "Open Mercato": not in text, and the card's logo file `public/open-mercato.svg` is the Vereino mark (V-N05b). A known published slug writes the `vereino_club` cookie (`Path=/`, one year, `SameSite=Lax`, `Secure` over HTTPS) and a later `/login` shows the same club. Both at 375 px, in both locales, light and dark.
- [ ] **AC-N11** — No Polish catalog value matches a pattern of the retired list (*Business rules*, "Retired term") in its scope outside `packages/app/scripts/check-glossary.allow.json`, and `yarn verify` fails when one is added. Glossary rules 1–2 and the wording of rules 3–5 are accepted by the native-reader review of phase 3, recorded on its pull request. The menu, page titles, tabs and statuses read as in the mockup's catalogs.
- [ ] **AC-N12** — The publication form refuses online requests without facility calendars. "Add section" can assign a coordinator; only adults are offered; the section's coordinator reads the Coordinators tab. People can be filtered by the attendant role; the person header shows age and account.
- [ ] **AC-N13** — With the events block on, P-06 lists the upcoming one-off events of public groups and those of the last 60 days, past ones marked, filtered by section, at 375 px in both locales; P-01 and P-02 list none; with the block off the menu item and the page are gone; a team card names its category; a missing section offers the club page.
- [ ] **AC-N14** — At 375 px, in pl and en, light and dark: the Messages tile shows the unread count and the newest unread thread, or "Brak nowych wiadomości."; the primary payer's ward card carries the badge.
- [ ] **AC-N15** — No member or public page shows a text loading message; each shows a skeleton and, when empty, a sentence with a next action.
- [ ] **AC-N16** — `docs/ux-concept/README.md` §1, §3.1 and §3.2 agree with this spec and D-029 to D-031.
- [ ] Every listed backend surface matches its recorded Open Mercato reference and uses the canonical shell/components, shared API helpers, semantic tokens, and complete loading, empty, error, conflict, keyboard, accessibility, responsive, light-mode, and dark-mode states.
- [ ] Every affected API and UI path has self-contained integration coverage and the configured validation gate passes.

## Final Compliance Report

| Check | Status | Evidence / resolution |
|---|---|---|
| Applicable `AGENTS.md` files and routed guides/skills reviewed | pass | `AGENTS.md` (module boundaries, Ask First, coverage rule, spec changelog), `.ai/guides/spec-delivery.md`, `om-spec-writing`, `.ai/specs/SPEC-000-template.md`, D-029, D-030, D-031 |
| Data models, APIs, events, UI, and tests are internally consistent | pass | Requirement Traceability, REQ-N01…REQ-N16 |
| Every workflow completes end to end without a catch-all integration phase | pass | J-N01…J-N05; each phase closes its own requirements |
| Platform-native reuse and extension points were chosen before custom code | pass | Reuse and Ownership Map; DD-N01, DD-N03, DD-N05 |
| UI contracts identify references, canonical components, and theme/state coverage | pass | UI and Interaction Contracts |
| Every phase has dependencies, bounded slices, tests, value, and an observable exit gate | pass | Phases 1–11 |

| Pre-implementation audit gaps closed | pass | [audit on #251](https://github.com/wladku/Vereino/issues/251#issuecomment-6891759309) (c1) *Rollback*; (c2) *Proposed Solution → Public header and sign-in*; (c3) *Top bar and dashboard*, AC-N04; (c4) V-N02, V-N05, V-N05b in *Open Questions*; (c5) "Retired term" rule, TEST-N10, AC-N11; (c6) phase 6, *Compatibility*, AC-N03, app catalog locales |

Verdict: `Ready for implementation` — the owner answered Q-N01…Q-N03, confirmed A-N01…A-N17 and approved the six Ask First items on 2026-11-15 ([#251](https://github.com/wladku/Vereino/issues/251#issuecomment-6891956957)). V-N01, V-N03 and V-N04 stay with the implementer and have fallbacks. Phase 6's two payments counts wait for spec C (REQ-C09).

## Resolved assumptions (autonomous defaults)

Confirmed as written by the product owner on 2026-11-15 ([#251](https://github.com/wladku/Vereino/issues/251#issuecomment-6891956957)), including the four with product weight: A-N04, A-N13, A-N16 and A-N17. Each is the option closest to the mockup unless a recorded decision said otherwise.

| ID | Question | Chosen answer | Rationale |
|---|---|---|---|
| A-N01 | English name of the group that D-031 §1 calls "Activities" | "Classes" (Polish "Zajęcia") | The mockup's catalogs say `shell.backendShell.groupClasses` = "Zajęcia" / "Classes"; D-031 §2 makes the catalogs binding and reserves "activity" for the series |
| A-N02 | Tabs as routes or as `?tab=` state | Routes, with `?tab=` as an alias (DD-N02) | D-031 §1: existing routes stay the addresses of the tabs |
| A-N03 | Where do People → Imports and Facility → Rented hours and Maintenance go | Imports: a button on B-09. Rented hours: a second tab of B-28. Maintenance: the fourth tab of B-27, as in the mockup | The mockup has one People item and six facility items; all three pages stay (decided in #128, #129 and the club spec) |
| A-N04 | Which feature opens "Threads and cases" | `communication.post`, as today (the mockup says `communication.view`) | Every member holds `communication.view`; the panel list is a staff surface |
| A-N05 | Which feature opens the tabs of "Zones and rates" | As today (`facilities.view` on the lists, `facilities.manage` to edit); the mockup says `facilities.manage` | No access change without a decision; spec R owns the tab contents |
| A-N06 | Where the More list lives | In the More menu of the bottom bar only (DD-N07) | #101 built it there; the mockup's list on the profile page would be a second copy |
| A-N07 | Is Facilities listed under More when it is already the fourth tab | No | One entry per destination |
| A-N08 | Default context of a person with both sides | Member, with the last choice remembered (unchanged) | The mockup offers the switch; only the coach-only case was wrong |
| A-N09 | Does a coordinator get a third context | No; one staff context labelled "as coach / coordinator" (DD-N08), which exposes the coordinator scope to spec A's pages | The mockup's switcher has two positions |
| A-N17 | The mockup's calendar mixes the wards' and the coached sessions; the application shows one or the other by the switcher | The member context shows both in one list; the staff context shows the staff sessions only | The mockup's M-03; it is what Today already does with its tiles, and #101's switcher keeps a meaning |
| A-N10 | Where a coordinator lands | `/club` | D-029 and D-031 §3: daily work is on the phone |
| A-N11 | Slug length (the mockup hints 3–40, the club spec and the code say 3–60) | 3–60 stays | A rule, not a name; the README says the specification wins on rules |
| A-N12 | Short club name required (mockup) or optional (code) | Optional stays | The club name is the fallback everywhere it is shown |
| A-N13 | PESEL field for a user without `people.pesel.view` | Shown empty and disabled with the mockup's hint | Shows that the field exists without revealing whether a value is stored |
| A-N14 | Counts: which sessions | Planned, without a coach, from today on, in the caller's scope (the B-15 tab "Do obsadzenia") | The mockup's formula in `backendShell` |
| A-N15 | "Sekcje" in the public header | Links to the sections block of the club page | The mockup links to one section; a list is the honest target |
| A-N16 | Sign-in tagline | The mockup's fixed text `m.screenLogin.tagline`, not a club setting | No new field |

## Open Questions

| ID | Question | Owner | Blocking? | Resolution / decision date |
|---|---|---|---|---|
| Q-N01 | How does `/login` know the club when a member types the address on a new device? Default: it shows Vereino's name until the member arrives once from the club's page or link, then the cookie remembers the club. A single-club instance could always show its club, but that needs a new system-scope read | Władek Kuć | no | Resolved 2026-11-15 ([#251](https://github.com/wladku/Vereino/issues/251#issuecomment-6891956957)): the default — Vereino's name until the person arrives once from the club's page, then the `vereino_club` cookie; no new system-scope read |
| Q-N02 | Should an administrator who has no child in the club and does not train land on `/backend` (mockup, README M-01) instead of `/club` (today)? Default: yes | Władek Kuć | no (phase 5 ships the default) | Resolved 2026-11-15 ([#251](https://github.com/wladku/Vereino/issues/251#issuecomment-6891956957)): yes, with the attendant on `/club/facility` and the additive `GET /api/people/me` fields |
| Q-N03 | May the coordinator and the attendant roles receive `dashboards.view`? It resolves the club spec's promise of coordinator widgets. Default: yes | Władek Kuć | yes, for phase 6 slice (b) only | Resolved 2026-11-15 ([#251](https://github.com/wladku/Vereino/issues/251#issuecomment-6891956957)): yes; TEST-N04's exact widget list per role is the guard; `roles.test.mjs:59` and `activities/README.md:169` change with it |
| V-N01 | Can a sidebar item stay marked active on a sibling tab route? | implementer, phase 2 | no (fallback: breadcrumb and title, as on B-11 today) | pending |
| V-N02 | Exact form of `overrides.nav.groupOrder` on a `modules.ts` entry, and that it orders Vereino's six groups before the platform's | implementer, phase 1 | no | Resolved 2026-11-15 in the code (`@open-mercato/shared/src/modules/overrides.ts:122-131` and the `nav` applier): `overrides: { nav: { groupOrder } }` on one module entry prepends the named groups in order; when two entries declare it the later wins with a warning. Declared on `club_core` only |
| V-N03 | Can a page have a menu label different from its page title? | implementer, phase 1 | no (fallback: the menu label is the `pageTitleKey`; the page component renders the long title) | pending |
| V-N04 | Does a role ever hold a feature of a disabled module, so that a More entry could lead nowhere? | implementer, phase 4 | no (fallback in *Risks*) | Resolved 2026-11-15 (#258): no — `people`, `groups`, `activities`, `communication`, `payments` and `facilities` are enabled unconditionally in `src/modules.ts`, and every More route has a page except Groups (`/club/groups`, spec A REQ-A11). Instead of the route-list fallback, a destination row carries `available`; Groups is `false` until spec A ships its page, so its entry stays hidden whatever the grants |
| V-N05 | Does the role-assignment command already refuse a minor as coordinator? V-N05b: which seam replaces the logo and brand line of the platform sign-in card? | implementer, phases 7 and 8 | no | Resolved 2026-11-15 in the code. V-N05: no — no `role_requires_adult` code exists, so phase 8 adds the code and the check (approved). V-N05b: no seam — the card hard-codes `src="/open-mercato.svg"` (`@open-mercato/core/src/modules/auth/frontend/login.tsx:355`); phase 7 replaces `packages/app/public/open-mercato.svg` and overrides the catalog keys (AC-N10) |

## Changelog

Each change is its own file in `.ai/specs/changelog/2026-11-14-vereino-parity-navigation-and-naming/` (`YYYY-MM-DD-<slug>.md`, one `| date | change |` row), so parallel PRs never conflict here; `cat .ai/specs/changelog/2026-11-14-vereino-parity-navigation-and-naming/*.md` lists them in date order. Never add rows to this section. The entry for the superseded rows of the club spec is `.ai/specs/changelog/2026-10-20-vereino-club-management/2026-11-14-parity-n.md`.
