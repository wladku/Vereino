# Legal claims checked against primary texts

The design of Vereino's consents, retention and DPIA rests on five legal statements that the engineering research
marked unverified (research C, Appendix B: B1, B2, B3, B10, B12 —
`.ai/specs/research/engineering-standards/c-domain-concerns.md`). Engineering standards S9.10 requires them to be
verified before the pilot. The product owner decided (ENG-Q-06, 2026-11-20, epic #461) that agents verify them from
primary texts with citations and that the owner accepts the result; no lawyer's opinion for now.

This document is that verification (E19-S01, #467). It is not legal advice.

## How to read it

- **Primary source** means the official text: the act or its consolidated text (*tekst jednolity*) as published in
  Dziennik Ustaw or Monitor Polski, the Official Journal of the EU, or the payment provider's own documentation.
  Secondary articles were used only to find the source and are not cited as evidence.
- **Read on** is the day the text was read. Polish acts were read from the Sejm ELI service (`api.sejm.gov.pl/eli`),
  which serves the same files as ISAP (`isap.sejm.gov.pl`, whose pages ask for human verification). EU texts were read
  from the Publications Office (`publications.europa.eu`), which serves the same documents as EUR-Lex.
- **Conclusion** is one of: **confirmed** (the primary text says what the claim says), **corrected** (the primary text
  says something different; the correct statement is given), **could not verify** (no primary text was read; what is
  missing is named). Nothing is marked confirmed on the strength of a secondary source.
- Quotes are short excerpts in the source language. Polish legal names stay in Polish; explanations are in English.

## Summary

| # | Claim (research C) | Conclusion | Changes a Vereino default? |
|---|---|---|---|
| B1 | Poland did not lower the GDPR art. 8 age of digital consent below 16 | **confirmed** | no — the 16-year default of S9.3 and `own_account_min_age` stays |
| B2 | The UODO DPIA list names children ("osoby wymagające szczególnej opieki") and the "at least two criteria" rule | **corrected** — the two-criteria rule is in the UODO list; children are a criterion of the WP29/EDPB guidelines WP 248 rev.01, not of the UODO list | no — a DPIA is still required; the DPIA (E19-S02, #468) cites the right source |
| B3 | Accounting Act art. 74: 5 years for vouchers from the year after the financial year; 6-year default covers the tax limitation period | **corrected** in one detail — 5 years after the financial year is confirmed and the 6-year default is confirmed; vouchers of loans, contracts and claims pursued in proceedings run from the year after the matter is finally settled | no change to `accounting_retention_years`; one new requirement for the retention sweep (#475) |
| B10 | The cookie rules are in PKE arts. 398–400 (Dz.U. 2024 poz. 1221) | **corrected** — the cookie rule and its exemption are in **art. 399**; art. 398 is about unsolicited commercial communication, art. 400 points consent to the data protection rules | no — S9.9 (no banner while only necessary storage is used) holds; cite art. 399 |
| B12 | On Stripe, P24 lists MCC 7941 Sports Clubs/Fields as "restricted", meaning extra information rather than refusal | **confirmed**, with the wording corrected — Stripe asks for extra information "at account creation", and support is "may be", not assured | no — an owner action when the club's Stripe account is set up |

## B1 — The Polish digital-consent age is 16

**Claim.** Poland did not use the option of GDPR art. 8(1) to set a lower age, so the default of 16 applies to
consent-based information society services offered directly to a child.

**Primary sources.**

1. Regulation (EU) 2016/679 (GDPR), art. 8(1), Official Journal L 119, 4.5.2016, p. 1 —
   <http://publications.europa.eu/resource/celex/32016R0679> (same text as
   <https://eur-lex.europa.eu/eli/reg/2016/679/oj>). Read on 2026-11-20.
   > "the processing of the personal data of a child shall be lawful where the child is at least 16 years old"
   >
   > "Member States may provide by law for a lower age for those purposes provided that such lower age is not below
   > 13 years."
2. *Ustawa z dnia 10 maja 2018 r. o ochronie danych osobowych*, consolidated text Dz.U. 2019 poz. 1781 (the latest
   consolidated text listed) — <https://api.sejm.gov.pl/eli/acts/DU/2019/1781/text.html> (ISAP
   <https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20190001781>). Read in full on 2026-11-20 (Art. 1–176).
   The act contains no provision on the age in GDPR art. 8: the words "16 lat", "13 lat", "wiek", "dziecko" and "dzieci"
   do not occur; the only "dziecka" is the *Rzecznik Praw Dziecka* in art. 50 ust. 1. The act's own art. 8 is about
   appointing a data protection officer.
3. The three acts that amended it after the consolidated text, read on 2026-11-20 from the ELI PDF texts:
   - *Ustawa z dnia 23 stycznia 2026 r. o zmianie ustawy o krajowym systemie cyberbezpieczeństwa oraz niektórych innych
     ustaw* (Dz.U. 2026 poz. 252) — changes only art. 104 (where administrative fines go);
   - *Ustawa z dnia 27 marca 2026 r. o zarządzaniu danymi* (Dz.U. 2026 poz. 548) — adds art. 34 ust. 2a (UODO's tasks
     under the Data Governance Act);
   - *Ustawa z dnia 3 lipca 2026 r. o systemach sztucznej inteligencji* (Dz.U. 2026 poz. 1003) — adds art. 59a ("Prezes
     Urzędu współpracuje z Komisją Rozwoju i Bezpieczeństwa Sztucznej Inteligencji").

   None of them touches the consent age.

**Conclusion: confirmed.** Polish law sets no lower age, so GDPR art. 8(1) applies as written: 16.

**Limits.** Art. 8 covers only processing based on consent (art. 6(1)(a)) for information society services offered
directly to a child. Vereino's core processing rests on the membership contract with the guardian (S9.2), so art. 8
matters for consent-based options a 13–15-year-old might be asked for directly; those stay with the guardian. Whether
another Polish act sets a different age for a narrower purpose was not searched; this check covers the data protection
act, the act that would carry the art. 8 option.

**What would change in Vereino if it had been wrong.** A lower Polish age (13–15) would let the club accept a ward's own
consent for optional processing from that age; the default of the club setting `own_account_min_age` (club spec
REQ-002, D-022, Q-007) and the consent rules of S9.3 would follow it. Nothing changes now.

## B2 — The UODO list of processing that needs a DPIA

**Claim.** The UODO list (M.P. 2019 poz. 666) contains a criterion for persons needing special care, children
included, and the rule that processing meeting at least two criteria generally needs a DPIA.

**Primary sources.**

1. *Komunikat Prezesa Urzędu Ochrony Danych Osobowych z dnia 17 czerwca 2019 r. w sprawie wykazu rodzajów operacji
   przetwarzania danych osobowych wymagających oceny skutków przetwarzania dla ich ochrony* (M.P. 2019 poz. 666),
   annex — <https://monitorpolski.gov.pl/M2019000066601.pdf> (same file as
   <https://api.sejm.gov.pl/eli/acts/MP/2019/666/text.pdf>). Read in full (5 pages) on 2026-11-20.
   - The two-criteria rule is in the introduction of the annex:
     > "Co do zasady, przetwarzanie spełniające przynajmniej dwa z niżej wymienionych kryteriów będzie wymagać oceny
     > skutków dla ochrony danych."
   - The list has twelve criteria: (1) evaluation or scoring, (2) automated decisions with legal or similar effects,
     (3) systematic monitoring of publicly accessible places, (4) special categories and criminal data, (5) biometric
     data for identification, (6) genetic data, (7) large scale, (8) matching data from different sources,
     (9) persons whose evaluation and services depend on bodies with supervisory or evaluative powers, (10) innovative
     technology, (11) processing that prevents exercising a right or using a service, (12) location data. **None of
     them is "persons needing special care" or "children".** Children appear only as an example under criterion 10
     ("Usługi i zabawki dedykowane dzieciom", for interactive toys), and "wrażliwe podmioty danych" only in an example
     under criterion 3. The list says it was drawn up on the basis of the WP29 guidelines WP 248 and supplements them.
2. Article 29 Working Party, *Guidelines on Data Protection Impact Assessment (DPIA) and determining whether processing
   is "likely to result in a high risk"*, WP 248 rev.01, adopted 4 October 2017, endorsed by the EDPB —
   <https://ec.europa.eu/newsroom/article29/items/611236> (PDF `doc_id=47711`). Read on 2026-11-20, section III.B.a.
   - Criterion 7, "Data concerning vulnerable data subjects":
     > "Vulnerable data subjects may include children (they can be considered as not able to knowingly and thoughtfully
     > oppose or consent to the processing of their data)"
   - Criterion 4 covers data of a highly personal nature, including "financial data that might be used for payment
     fraud".
   - > "In most cases, a data controller can consider that a processing meeting two criteria would require a DPIA to be
     > carried out."

**Conclusion: corrected.** The two-criteria rule is in the UODO list (and in WP 248). The children criterion is not in
the UODO list; it is criterion 7 of WP 248, the guidelines the UODO list is built on and explicitly supplements.

**What changes in Vereino.** The DPIA requirement stands: Vereino processes children's data (WP 248 criterion 7) and
payment data (criterion 4), two criteria, so the club carries out a DPIA before the pilot (S9.7). The DPIA
(`docs/compliance/dpia.md`, E19-S02, #468) must name its triggers as WP 248 criteria 4 and 7 under GDPR art. 35(1),
with the UODO list's two-criteria rule, and must not cite a UODO criterion for children. No setting or default
changes, so no follow-up issue.

## B3 — Accounting retention

**Claim.** *Ustawa o rachunkowości* art. 74: vouchers are kept 5 years counted from the start of the year after the
financial year in which the operations were concluded; approved financial statements 5 years from the start of the
year after approval (changed in 2019 from "permanently"). Vereino's default of 6 full years after the end of the
financial year (S9.5, setting `accounting_retention_years`) adds a year for the tax limitation period.

**Primary sources.**

1. *Ustawa z dnia 29 września 1994 r. o rachunkowości*, consolidated text Dz.U. 2026 poz. 522 (*Obwieszczenie
   Marszałka Sejmu z dnia 30 marca 2026 r.*) — <https://api.sejm.gov.pl/eli/acts/DU/2026/522/text.pdf>. Read on
   2026-11-20. The two later amending acts (Dz.U. 2026 poz. 640 and 644) were read too; neither changes art. 74.
   - Art. 74 ust. 1 (approved annual statements): "podlegają przechowywaniu przez okres co najmniej 5 lat, licząc od
     początku roku następującego po roku obrotowym, w którym zatwierdzono sprawozdanie finansowe".
   - Art. 74 ust. 2 pkt 8 (the general rule for vouchers): "pozostałe dowody księgowe i sprawozdania, których obowiązek
     sporządzenia wynika z ustawy – 5 lat", and pkt 1: "księgi rachunkowe – 5 lat".
   - Art. 74 ust. 3: "Okresy przechowywania ustalone w ust. 2 oblicza się od początku roku następującego po roku
     obrotowym, którego dane zbiory dotyczą."
   - Art. 74 ust. 2 pkt 4 (the exception): vouchers on "pożyczek, kredytów oraz umów handlowych, roszczeń dochodzonych w
     postępowaniu cywilnym lub objętych postępowaniem karnym albo podatkowym" are kept "przez 5 lat od początku roku
     następującego po roku obrotowym, w którym operacje, transakcje i postępowanie zostały ostatecznie zakończone,
     spłacone, rozliczone lub przedawnione".
2. *Ustawa z dnia 29 sierpnia 1997 r. – Ordynacja podatkowa*, consolidated text Dz.U. 2026 poz. 622 (*Obwieszczenie
   Marszałka Sejmu z dnia 22 kwietnia 2026 r.*) — <https://api.sejm.gov.pl/eli/acts/DU/2026/622/text.pdf>. Read on
   2026-11-20.
   - Art. 70 § 1: "Zobowiązanie podatkowe przedawnia się z upływem 5 lat, licząc od końca roku kalendarzowego, w którym
     upłynął termin płatności podatku."
   - Art. 86 § 1: taxpayers keeping tax books keep them and the related documents "do czasu upływu okresu przedawnienia
     zobowiązania podatkowego, chyba że ustawy podatkowe stanowią inaczej".

**Conclusion: corrected in one detail; the default is confirmed.**

- Confirmed: books and ordinary vouchers are kept at least 5 years, counted from the start of the year after the
  financial year they concern; approved statements 5 years from the start of the year after approval.
- Confirmed: the 6-year default is the right reading of the tax rule. Tax for financial year *N* falls due in year
  *N+1*, so the limitation period runs to the end of *N+6*; keeping records 6 full years after the end of the financial
  year covers both acts.
- Corrected: "from the year in which the operations were concluded" is not the general rule; it applies only to the
  art. 74 ust. 2 pkt 4 category (loans, credits, commercial contracts, claims pursued in civil proceedings or covered by
  criminal or tax proceedings), whose 5 years start only after the matter is finally settled.
- Could not verify (and not needed): that the statements rule changed in 2019 from "permanently". The current text's
  footnote dates the present wording of ust. 1 to an amendment in force from 1 January 2022; the earlier history was
  not read.

**What changes in Vereino.** `accounting_retention_years` keeps its default of 6. The retention sweep (TEST-C04 of
research C, built under E19-S04 #470 and its follow-ups) must not count from the financial year for records of a charge
the club pursues in court or that is part of criminal or tax proceedings: those run from the year after the proceedings
end. Follow-up issue: #475.

**Side note (not one of the five claims).** Research C mentions the simplified revenue and cost records (*uproszczona
ewidencja przychodów i kosztów*) and a proposed rise of their threshold to 1 mln zł. *Ustawa o działalności pożytku
publicznego i o wolontariacie* (consolidated text Dz.U. 2025 poz. 1338, read on 2026-11-20) art. 10a ust. 1 pkt 5 still
says "nieprzekraczającej 100 000 zł"; the amending act Dz.U. 2026 poz. 1040 does not change art. 10a (it raises a
different 100 000 zł figure, in art. 23 ust. 6c). Whether the club uses the simplified records is a question for its
accountant (club spec Q-034); it changes what the accountant needs, not the retention period.

## B10 — The cookie rules in the Electronic Communications Law

**Claim.** *Prawo komunikacji elektronicznej* (PKE, Dz.U. 2024 poz. 1221, in force 10 November 2024) regulates
storing and reading information on the user's device in arts. 398–400, replacing art. 173 of *Prawo
telekomunikacyjne*; storage necessary for a service the user asked for needs no consent.

**Primary sources.**

1. *Ustawa z dnia 12 lipca 2024 r. – Prawo komunikacji elektronicznej* (Dz.U. 2024 poz. 1221), original text —
   <https://isap.sejm.gov.pl/isap.nsf/download.xsp/WDU20240001221/O/D20241221.pdf>. Read on 2026-11-20. The five acts
   that amended it since (Dz.U. 2025 poz. 637 and 820, Dz.U. 2026 poz. 252, 815 and 1296) were read too; none changes
   art. 399.
   - Art. 399 ust. 1 is the rule: storing or reading information in the user's terminal equipment "jest dozwolone, pod
     warunkiem że" the user was first informed clearly of the purpose and of how to control it through software
     settings, and then "wyrazi na to zgodę".
   - Art. 399 ust. 2: the consent may be given through the settings of the software on the device.
   - Art. 399 ust. 3 is the exemption: the conditions do not apply where storing or access "jest konieczne do: […]
     dostarczania usługi telekomunikacyjnej lub usługi świadczonej drogą elektroniczną, żądanej przez abonenta lub
     użytkownika końcowego".
   - Art. 398 bans automated calling systems and terminal equipment for sending commercial information without prior
     consent (direct marketing), not cookies.
   - Art. 400: "Do uzyskania zgody abonenta lub użytkownika końcowego stosuje się odpowiednio przepisy o ochronie danych
     osobowych."
   - Art. 450: the act enters into force on the date set by the introductory act.
2. *Ustawa z dnia 12 lipca 2024 r. – Przepisy wprowadzające ustawę – Prawo komunikacji elektronicznej* (Dz.U. 2024 poz.
   1222) — <https://api.sejm.gov.pl/eli/acts/DU/2024/1222/text.pdf>. Read on 2026-11-20. Art. 68 ust. 1: "Traci moc
   ustawa z dnia 16 lipca 2004 r. – Prawo telekomunikacyjne" (with two exceptions unrelated to art. 173). The act
   enters into force three months after publication; both acts were published on 9 August 2024, and the ELI record
   gives 10 November 2024 as the date in force.
3. Directive 2002/58/EC (ePrivacy), art. 5(3), consolidated text of 19 December 2009 —
   <http://publications.europa.eu/resource/celex/02002L0058-20091219>. Read on 2026-11-20. The exemption PKE art. 399
   ust. 3 implements: storage or access "as strictly necessary in order for the provider of an information society
   service explicitly requested by the subscriber or user to provide the service".

**Conclusion: corrected.** The act, its citation and its date in force are confirmed, and so is the repeal of *Prawo
telekomunikacyjne* (with art. 173). The cookie rule and its exemption are in **art. 399** alone; art. 398 is the
direct-marketing rule and art. 400 sends consent to the GDPR rules. Cite "art. 399 PKE" in the privacy notice and the
cookie information.

**What changes in Vereino.** Nothing in the design: S9.9 holds — while Vereino stores only what the requested service
needs (session and sign-in, CSRF, locale, rate limit), art. 399 ust. 3 needs no consent and no banner; analytics or
third-party embeds would need consent under art. 399 ust. 1 and a spec change. The privacy notices (E19-S03, #469) cite
art. 399. No setting changes, so no follow-up issue.

## B12 — Przelewy24 on Stripe for a sports club

**Claim.** On Stripe, the Przelewy24 (P24) payment method lists MCC 7941 Sports Clubs/Fields as "restricted", which
means Stripe asks for more information at activation rather than refusing.

**Primary sources.**

1. Stripe documentation, *Przelewy24 payments* — <https://docs.stripe.com/payments/p24>. Read on 2026-11-20.
   - The MCC table row: "7941 Sports Clubs/Fields Restricted".
   - > "Prohibited MCCs are not supported by this payment method. Restricted MCCs may be supported, but require
     > additional information at account creation."
   - > "You can contact Stripe support to appeal any P24 capability restrictions."
   - The merchant's website must display the business address, the tax identification number, the business
     registration number, the return and refund policy, a privacy policy and terms of service.
   - Besides the MCC table, P24 prohibits some business categories, among them "Entertainment and event promotion
     services"; sports clubs are not in that list.
2. Stripe, *Prohibited and restricted businesses* — <https://stripe.com/legal/restricted-businesses>. Read on
   2026-11-20. It has no MCC list; it says restricted businesses "require additional due diligence by Stripe" and that
   approval may be refused or revoked.
3. Przelewy24 terms (<https://www.przelewy24.pl/en/regulations>), read on 2026-11-20: no rule on sports clubs or
   merchant categories.

**Conclusion: confirmed, with the wording corrected.** MCC 7941 is "Restricted" for P24. Stripe's own words are "may
be supported, but require additional information at account creation": not a refusal, but not a promise either. What
Stripe asks for and how long it takes is not documented; only Stripe support can say.

**What changes in Vereino.** Nothing in the design. Owner action when the club's Stripe account is set up: expect a
request for more information before P24 is enabled, and make sure the club's public pages show the business address,
NIP, KRS (or other registration) number, refund policy, privacy policy and terms (the club spec's public pages). BLIK
has no MCC table on its page, so nothing is restricted there.

## Follow-up issues

- #475 — the accounting retention sweep keeps records of claims pursued in proceedings until 5 years after the year the
  proceedings end (B3). Answered 2026-11-22: deferred, since the club pursues no dues in court; the build is #560
  (retention schedule R1a, open item R-H).

No other conclusion changes a default or a requirement: B1 and B12 are confirmed, and the corrections of B2 and B10
change only which source the DPIA and the privacy notices cite.

## Items for the lawyer

Questions that the verification above cannot settle from primary texts; each blocks the production release it names,
not the build.

| Id | Question | Source | Blocks |
|---|---|---|---|
| Q-J09 | Confirm **art. 6(1)(b) GDPR** (steps taken at the request of the data subject, or of the child's parent, before entering into a membership contract) as the legal basis for applications to a section by people who are not members ([`ropa.md`](ropa.md) A17), and the default information text shown to applicants (club setting `application_information`; null = the built-in default) | section sign-up form spec (`.ai/specs/2026-11-25-vereino-section-sign-up-form.md`), owner decision 2026-11-26 | the production release of E26 phase 2 (#799) |

## Acceptance

Accepted by the product owner on: _(date, to be filled in by the owner)_.
