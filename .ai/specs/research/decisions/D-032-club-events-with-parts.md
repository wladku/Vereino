---
number: D-032
date: 2026-11-18
owner: Władek Kuć
source: the owner's answers of 2026-11-18, after trying to enter the club's real tournament "Gwiazda Cup 2026" (four days, nine age-category tournaments, one external hall) in the sandbox
status: confirmed
---
# D-032 The club can organise an event with parts: one tournament, many categories, days and groups

The sandbox at `main` `3252cf4` offers only a one-off event for one group. A club-hosted tournament such as "Gwiazda Cup 2026" — Saturday and Sunday on two weekends, a separate tournament per age category (Orlik młodszy, Żak młodszy, Trampkarz, Żak starszy, Skrzat, Młodzik starszy, Orlik starszy, seniors, and a "Kids" match with parents), all in the municipal hall in Liszki — has to be entered as nine unrelated events, with no common page and no place for the teams of other clubs. The owner settled the shape of the feature:

1. **An event with parts.** One club event carries the shared facts — name, venue, poster, description, the organising club — and holds parts. Each part has its own day, start and end, category, the club's group that plays in it, and the visiting teams. A guardian sees in the calendar only the part of their own child's group.
2. **Scope of the first version:**
   - adding the teams from outside the club that take part, per part;
   - showing publicly which of the club's groups (from which section) plays in each part;
   - a public tournament page.
   Online registration of visiting teams, results and standings, and entry fees are not in the first version.
3. **Who creates it:** the club administrator for the whole club and a section coordinator for their own section, in the panel and on the phone. A coach keeps creating single one-off events for their own group.
4. **The venue:** chosen from the list of places, where the club's own and external places are both offered and external ones are marked; when the place is missing, the administrator or the coordinator adds it from the form and it stays on the list for next time.

**Why:** the club organises such tournaments several times a season, they are funded publicly (the poster names the municipality and the ministry), and parents, visiting clubs and sponsors look for one page with the whole schedule; nine unrelated events hide that the club is the host.

**Applied in:** `.ai/specs/2026-11-18-vereino-club-events-with-parts.md`.

**To change:** a superseding record approved by the owner.
