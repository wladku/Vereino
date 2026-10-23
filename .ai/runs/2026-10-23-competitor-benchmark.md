# Competitor benchmark for product discovery

- **Date:** 2026-10-23
- **Agent / tool:** Claude Code (Claude Opus 5.5), side session started from the discovery session; WebSearch and WebFetch
- **Trigger:** the product owner's request (written for other LLMs) relayed by the parent discovery session (`om-discover`)
- **Spec / issue / branch:** no spec or issue; branch `claude/competitor-benchmark-08a1cc` (worktree branch created by the app; the parent asked to commit on this branch)
- **Status:** completed

## Goal

Find 8–15 realistic alternatives for a small Polish multi-section sports club that administers a municipal Orlik facility, and record for each one what its own pages say about Vereino's scope items 1–10, with links and the date checked. Re-check ProTrainUp's pricing page and note differences from `2026-09-30-benchmark-protrainup.md`. Separate page facts from assessment; do not assess demand.

## Steps

1. Read `.ai/specs/research/2026-09-30-benchmark-protrainup.md`, the research README, the runs README and the sibling note in the shared notes folder (`discovery-pipeline-setup.md`). `product-brief.md` and the SportBM benchmark of 2026-10-23 are not in this worktree.
2. Web searches (Polish and English) for club/academy apps, multi-section club software, municipal facility and Orlik booking systems, and open-source options.
3. Read vendor pages with WebFetch: home, pricing and feature pages, help-centre articles and repositories for 13 products (ProTrainUp, SportBM, PlayTeam, SportsManago, Vibeclass, Pagaspot, Spond, SportMember, SportEasy, OPTeam's facility booking system, Caldis, Admidio, LibreBooking), plus the Olsztyn municipal booking portal and eAktywni.
4. Re-read ProTrainUp's pricing page and compared it with the 2026-09-30 note.
5. Wrote `.ai/specs/research/2026-10-23-benchmark-competitors.md`: one section per product, matrix, three closest products, gaps, questions to check by hand.

## Decisions

- **"no data" instead of "no"** whenever a page does not mention a feature — the evidence rules forbid reading absence as a missing feature. As a result, the matrix holds no "N" and no "Y".
- **Included Pagaspot, SOROS, Caldis, LibreBooking** although they cover only fees or the facility — the request asked for facility systems and the fees/facility items are the hardest parts of Vereino's scope. Each is marked as a different segment.
- **Not profiled:** products whose own pages were not read (Skedda, GYM System, Asysto, Klubaro, Stadiops) and two club-app pages hosted on netlify/lovable that look like prototypes. eAktywni is listed briefly only, as a facility ticketing system.
- **SportBM's 13+ account claim is marked unverified:** it comes from a search-engine snippet of the terms PDF; the PDF could not be converted to text in this environment (no pypdf, no poppler).
- **Third-party aggregators (fitgap, Capterra, CB Insights) were not used as sources** for any feature or price.
- **Committed on the app-created worktree branch** as the parent asked, although `AGENTS.md` names branches `<type>/<kebab-slug>`; renaming is left to the product owner before a PR.

## Sources consulted (all opened 2026-10-23)

- ProTrainUp: https://protrainup.com/pl/pricing, https://protrainup.com/en/for/clubs-academies, https://protrainup.com/en/faq/parents
- SportBM: https://sportbm.com/pl/, https://sportbm.com/pl/cennik/, https://sportbm.com/pl/funkcje/, https://sportbm.com/files/regulamin-sportbm.pdf?version=19 (not readable)
- PlayTeam: https://playteam.pl, https://playteam.pl/price, https://playteam.pl/platnosci, https://playteam.pl/kalendarz-i-frekwencja, https://playteam.pl/komunikacja-z-rodzicami
- SportsManago: https://sportsmanago.pl, https://sportsmanago.pl/?p=cennik, https://sportsmanago.pl/?p=mozliwosci
- Vibeclass: https://vibeclass.pl/program-do-zarzadzania-klubem-sportowym/, https://vibeclass.pl/cennik/, https://vibeclass.pl/kalendarz-i-rezerwacje/, https://vibeclass.pl/rozliczenia-i-finanse/, https://vibeclass.pl/wewnetrzna-komunikacja/
- Pagaspot: https://pagaspot.com, https://pagaspot.com/cena, https://blog.pagaspot.com/automatyzacja-platnosci-w-klubie-sportowym-poradnik/
- Spond: https://www.spond.com/, help.spond.com articles 121230, 185666, 58192, 45292, 113372
- SportMember: https://www.sportmember.co.uk/en/team-app, https://sportmember.co.uk/public_pages/643, https://www.sportmember.co.uk/en/membership-fee, https://sportmember.de/en/faq/member-parent/profile-settings/how-do-i-attach-a-profile-to-another-profile
- SportEasy: https://www.sporteasy.net/en/clubs/plans/, https://www.sporteasy.net/en/clubs/features/payments-and-fees/
- OPTeam: https://opteam.pl/rozwiazania-it/platformy-i-aplikacje-web/system-obslugi-rejestracji-obiektow-sportowych
- Olsztyn portal: https://obiekty.olsztyn.eu/?page=1; Trzcianka school Orlik page on samorzad.gov.pl (vendor not named)
- Caldis: https://caldis.pl/system-rezerwacji-dla-obiektow-sportowych, https://caldis.pl/cennik
- eAktywni: https://eaktywni.pl/
- Admidio: https://www.admidio.org/, https://github.com/Admidio/admidio
- LibreBooking: https://github.com/LibreBooking/librebooking, https://librebooking.readthedocs.io/en/latest/ADMINISTRATION.html, https://librebooking.readthedocs.io/en/stable/_sources/BASIC-CONFIGURATION.rst.txt

## Files changed

- `.ai/specs/research/2026-10-23-benchmark-competitors.md` (new)
- `.ai/runs/2026-10-23-competitor-benchmark.md` (new, this file)

## Commands and results

- `yarn format:check` — **not run**: dependencies are not installed in this worktree (no `node_modules` at the root or in `packages/app`). Installing them only for a Markdown check was out of scope.
- No code, tests or typecheck affected.

## Open problems

- All facts come from an automated page-to-text fetch; plan/feature tick marks were lost on the SportsManago, Caldis and partly ProTrainUp pricing pages. Nothing was verified in a live account.
- SportBM terms PDF not read; Vibeclass per-user price above 20 users not visible; Spond Club not open to new registrations from Poland per its help centre.
- No page of any product states where customer data is hosted.
- The benchmark has not been re-checked by a human.

## Next steps

- The product owner re-checks the entries at their links, starting with the three closest products (ProTrainUp, Vibeclass, SportBM) and the "Questions to check by hand" list in the benchmark.
- Run `yarn format:check` once dependencies are installed (`yarn setup` / `yarn install`).
- Use the benchmark in `om-discover` as [BENCHMARK] evidence only; it says nothing about demand for Vereino.

## Lessons recorded

None.
