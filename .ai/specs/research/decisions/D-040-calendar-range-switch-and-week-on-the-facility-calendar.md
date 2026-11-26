---
number: D-040
date: 2026-11-25
owner: Władek Kuć
source: the owner's answers Q1–Q5 on issue #784 (https://github.com/wladku/Vereino/issues/784#issuecomment-7175962616), given in a Claude Code session after walking the demo sandbox; recorded in the calendar range switch spec
status: confirmed
---
# D-040 One Day / Week / Month switch on every calendar; the facility calendar gets a week again

Walking the demo sandbox before the first club demo, the owner found that the calendars do not let the reader choose the range: the public facility calendar opens on a whole month, the facility calendar in the panel shows one day only, and the member and coordinator calendars each offer a different set of views. The owner decided:

1. **Every calendar a person browses gets the same switch — Dzień / Tydzień / Miesiąc**: the public facility calendar (P-04), the member calendar (M-03), the facility calendar (B-23, with the place page on the phone M-11 sharing it) and the coordinator calendar (B-15). The member calendar keeps "Najbliższe" as its own tab.
2. **Defaults:** a phone opens on Day everywhere; a wider screen opens on Week everywhere.
3. **D-031 §4 is revised for the facility calendar.** The day axis stays as the Day view. A week is seven hour axes side by side on a desktop and a list of days on a phone; a month is a list of days. "The facility calendar is a day axis, not a week grid" no longer holds.
4. **The public schedule read gains optional `from`/`to`** so a week across two months is one request (an additive contract change; `?month=` keeps working).
5. **One shared switch in `@vereino/ui`**, the view and the date in the address, so a reload, a shared link and a QR code reopen the same view.

**Why:** a guest cannot see one day of a pitch, staff cannot see a place's week, and four different controls for one idea read as an unfinished product to clubs.

**Not changed:** what any reader may see (the switch changes the range only), the zone week preview (B-26), the dashboard tiles and the "upcoming" lists of the public club and section pages.

Specified in `.ai/specs/implemented/2026-11-25-vereino-calendar-range-switch.md` (ids `W`).
