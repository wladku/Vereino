# Vereino — domain concerns research (C)

Date of research: 2026-10-21. Target: spec `.ai/specs/2026-10-20-vereino-club-management.md` (sections *Users, Permissions, and Scope*, *Security, Privacy, and Compliance*, *Data Models › payments*, *Events, Jobs, Notifications*, *Risks and Tradeoffs*). Stack fixed: Next.js 16 + React 19 + TS on Open Mercato, MikroORM 7 + PostgreSQL 17, Redis, Railway, Docker, Stripe, Resend-style email.

Legend for evidence: **[official]** = vendor/standards documentation, **[legal]** = statute/regulator text or regulator publication, **[secondary]** = blog, law-firm note, community thread. "Fetched" = page read this session; "search" = snippet only. Where a primary text could not be fetched (CAPTCHA, DNS) it is marked and the claim is downgraded.

Spec cross-references use the spec's own IDs (DD-xx, Q-xxx, V-x, TEST-xxx).

---

## 1. GDPR and Polish law — children's data in a sports club app

### (a) Engineering requirements

**Lawful basis and consent model**
- Treat membership/declarations/attendance/charges as processing *necessary for the performance of a contract* with the guardian (art. 6(1)(b) GDPR) plus *legal obligation* for accounting records (art. 6(1)(c)), and club legitimate interest (6(1)(f)) for operational safety logs. Do **not** base core processing on consent: the Polish commentary cited by UODO-adjacent sources stresses that consent is not "freely given" when service delivery depends on it. Reserve explicit consent for optional things: publishing the instructor's name (`publish_name_consent_at` in the spec), image/photo publication, marketing.
- **Digital age of consent in Poland = 16.** The GDPR default in art. 8(1) applies; Poland did not use the member-state option to lower it to 13 (the national act of 10 May 2018 uses the term "usługi świadczone drogą elektroniczną" and did not set a lower age). Consequence for the spec's D-004/Q-007: a 13–15-year-old *own account* that relies on consent for an information-society service needs parental consent "given or authorised" by the holder of parental responsibility. Since the club account is created *by the guardian as part of the membership contract* and the child does not consent to anything, the cleanest design is: the guardian creates/enables the minor account (13–17) and the record stores `guardian_person_id`, `enabled_by`, `enabled_at`; the minor never passes through a self-service sign-up. Keep the threshold a club setting as the spec already says, but default it to the *account-enable-by-guardian* flow regardless of age.
- Store consent facts as rows, not booleans: `consent_type`, `given_by_person_id` (the guardian), `given_at`, `withdrawn_at`, `source` (ui/paper/email), `text_version`. Art. 7(1) requires the controller to be able to *demonstrate* consent; UODO lecture material recommends documented proof (e-mail/SMS).
- **Image consent is separate** from participation consent (UODO position quoted in Infor). Model it as a distinct `consent_type` and never infer it.
- Transparency for children (art. 12(1), recital 58): the privacy notice shown to a 13–17 account must be in plain language; provide a short child-facing version.

**Minimisation**
- Keep the spec's rule: PESEL optional, visible only with `people.pesel.view`, duplicate detection via HMAC; no participant/guardian lists on public pages; schedule without names.
- Do not collect birth date precision beyond what is needed for age-band logic; a date is fine, but no document scans.

**Retention and erasure vs accounting records**
- Accounting vouchers (KP cash receipts, bank statements used as booking evidence, charge/payment ledgers) must be kept **at least 5 years counted from the beginning of the year following the financial year they concern** (art. 74(2) ustawa o rachunkowości); approved annual financial statements at least 5 years from the start of the year following approval (art. 74(1), since 1 Jan 2019 — no longer "permanently"). Tax rule: until the limitation period of the tax liability, 5 years from the end of the calendar year in which the payment deadline fell (art. 70 §1 Ordynacja podatkowa) — effectively up to ~6 years.
- Art. 17(3)(b) GDPR: erasure does not apply where processing is required for a legal obligation. So the spec's **anonymisation command** is the right primitive: on erasure request, strip identity from `people` and from non-accounting rows, keep `payments_payments`, `payments_charges`, `payments_bank_transactions`, `payments_cash_handovers` with the person reference replaced by an opaque `payer_ref.code` (immutable in the spec — good) and `description`/`reference`/`counterparty_*` either left encrypted under a key that is destroyed later (crypto-shredding) or rewritten to a fixed placeholder once the retention period lapses.
- Retention jobs (schedulers, idempotent, run daily like the existing ones):
  - `people:retention-sweep`: former participants with no active membership for N months (club setting; propose 12) → anonymise non-accounting personal data; tokens, declarations, attendance names, order contact details (`contact_email`, `contact_phone`, `notes`) are purged; attendance *counts* stay.
  - `payments:retention-sweep`: bank import files (`attachments` private partition) and `payments_bank_transactions` encrypted fields → delete/overwrite after the accounting retention clock (`booked_on` year + 1 + 5 years; config `accounting_retention_years`, default 6 to cover tax limitation).
  - `facilities:purge-expired-requests` already exists in the spec (`pending_verification` → delete); add deletion of rejected/expired external requester data after 90 days.
  - `auth:purge-tokens`: delete consumed/expired declaration, order and booking tokens after 30 days (keep only the hash + consumed_at for audit).
  - Logs: 30–90 days, no PII (spec already: `createLogger` without PII).
- Record every anonymisation in an audit table with `requested_by`, `legal_basis_for_retention`, and the list of tables touched.

**DPIA**
- Perform a DPIA before pilot. Under art. 35(3) and the UODO list (M.P. 2019 poz. 666) the trigger rule is "at least two criteria"; this app matches: data of vulnerable persons (children), systematic processing of financial data, evaluation (attendance/declaration tracking), and innovative technology use (online payments, personal links). Keep the DPIA as a repo document (`docs/compliance/dpia.md`) with the data map generated from the entity definitions.

**Processors and contracts (art. 28)**
- Stripe: for payment data Stripe acts as an **independent controller** (Stripe DPA — Stripe Payments Europe Ltd for EU accounts) and commits to notify a data incident within 48 h. Still record Stripe in the processor/recipient register and link the DPA.
- Resend: processor for Customer Data; primary processing in the US; EU-SCCs (2021/914) + EU-US DPF; subprocessor list with 14-day notice; deletion within 90 days of termination. Choose **eu-west-1 (Ireland) sending region** — note it moves *sending* to the EU, **not** storage of logs/metadata, which stays in the US per Resend docs.
- Railway: processor; "primary processing operations take place in the United States"; GCP infra; SCCs + DPF; subprocessor list at trust.railway.com with 10-day notice; breach "without undue delay". Deploy to **EU West Metal (Amsterdam, `europe-west4-drams3a`)** for app, Postgres and Redis volumes. Railway staff state logs (build/deploy/HTTP) are kept in US West and **no contractual data-residency commitment exists on any plan**. Therefore: never log PII (already required), and document the transfer under SCCs/DPF in the ROPA.
- Keep a `docs/compliance/processors.md` with: vendor, role, DPA URL, transfer mechanism, region chosen, date reviewed.

**Breach handling**
- Art. 33: notify UODO within 72 h of *becoming aware*; staged notification allowed (33(4)); every breach, notified or not, goes into an internal breach register (33(5)). Art. 34: notify data subjects without undue delay when high risk; encryption of the affected data is a statutory exemption (34(3)(a)). Engineering: keep `security/breach-register.md` template, an alerting path (see §8), and make field-level encryption real so the 34(3)(a) exemption is arguable.

**What to encrypt / what to log**
- Encrypt at field level (spec `encryption.ts`): charge `description`, payment `reference`, bank `counterparty_name/account/title`, order `contact_email/phone/notes`, external requester data, PESEL (plus HMAC for dedupe), consent free-text. Encrypt at rest the `attachments` private partition (bank files).
- Log: actor id, acting_role, command name, entity id, version, outcome, request id, IP (short retention). Never: names, emails, titles of bank transfers, token values, message bodies.

### (b) Evidence
- GDPR art. 8 text (PL): https://odo24.pl/rodo-nawigator-online/rodo/artykul8 [secondary mirror of legal text]; Poland kept 16: https://www.prawownia.pl/zgoda-rodzica-na-przetwarzanie-danych-osobowych-dziecka-uslugi-internetowe-kiedy-jest-wymagana-jaka-jest-granica-wieku/ and https://lexdigital.pl/zgoda-na-przetwarzanie-danych-osobowych-dziecka/ [secondary, 2018–2023]; TRIS notification of the Polish draft: https://technical-regulation-information-system.ec.europa.eu/en/notification/26888/text/D/PL [official]. Primary statute (Dz.U. 2018 poz. 1000) not fetched — verify in ISAP before pilot (Q-007).
- UODO DPIA list: M.P. 2019 poz. 666, komunikat Prezesa UODO z 17.06.2019: https://monitorpolski.gov.pl/MP/2019/666 [legal]; summary https://www.isecure.pl/blog/zmiany-w-wykazie-operacji-wymagajacych-dpia/ [secondary]. ISAP PDF was behind a CAPTCHA this session; the "two criteria" rule and categories are from the secondary summaries — verify the annex text.
- Accounting retention: art. 74 uor via https://pro.rp.pl/rachunkowosc/art9505111-jak-dlugo-archiwizowac-dokumenty-ksiegowe-zmiany-od-2019-roku and https://ksiegowosc.infor.pl/rachunkowosc/ksiegi-rachunkowe/139910,Jak-dlugo-przechowywac-ksiegi-rachunkowe.html [secondary, 2019–2025]; tax limitation art. 70 §1 Ordynacja podatkowa via https://ksiegowosc.infor.pl/podatki/ordynacja-podatkowa/5214524,Jak-dlugo-trzeba-przechowywac-ksiegi-podatkowe-i-dowody-ksiegowe.html [secondary].
- Breach notification: https://www.parp.gov.pl/component/content/article/81837:naruszenie-ochrony-danych-osobowych [official PL agency]; EDPB Guidelines 9/2022 https://www.edpb.europa.eu/documents/guideline/guidelines-92022-on-personal-data-breach-notification-under-gdpr_nb and Guidelines 01/2021 examples https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-012021-examples-regarding-personal-data-breach_en [official, final 2022-01-03].
- Image consent vs participation (UODO stance): https://www.infor.pl/prawo/dziecko-i-prawo/przedszkolak/3055799,Zgoda-rodzicow-na-publikacje-wizerunku-dziecka.html [secondary]; UODO lecture on minors' image: https://nowybiuletyn.uodo.gov.pl/ochrona-wizerunku-i-prywatnosc-maloletnich-zapis-wykladu/ [official].
- Stripe DPA: https://stripe.com/legal/dpa [official, fetched via search; 48 h incident notice, Stripe Payments Europe]. Resend DPA: https://resend.com/legal/dpa [official, fetched, updated 2025-12-31]. Railway DPA: https://railway.com/legal/dpa [official, fetched]. Railway regions: https://docs.railway.com/reference/regions [official, fetched]; Railway staff on logs/residency: https://station.railway.com/questions/dpa-point-9-can-audio-uploaded-to-my-e-2d648493 [community, staff answer]. Resend regions: https://resend.com/docs/dashboard/domains/regions [official, fetched].
- Crypto-shredding pattern: https://www.mongodb.com/docs/v8.0/core/csfle/tutorials/right-to-erasure/ [official vendor, with "no legal guarantee" caveat]; https://oneuptime.com/blog/post/2026-02-17-how-to-set-up-crypto-shredding-for-gdpr-right-to-erasure-compliance-in-google-cloud/markdown [secondary].

### (c) Pitfalls
- Reading "13" from the GDPR floor and shipping self-service sign-up for 13-year-olds in Poland.
- Hard-deleting a person row that is referenced by `payments_payments` → destroys accounting evidence; use anonymisation + `payer_ref.code`.
- Using the guardian's e-mail as idempotency key or log field (Stripe docs explicitly warn against PII in idempotency keys).
- Assuming "EU region" on Railway/Resend equals EU residency; both vendors state US primary processing.
- Consent checkboxes bundled into the membership form (not freely given, not granular).
- Bank-statement files kept forever "just in case": they contain third-party data (other payers) and are the most sensitive artefact in the system.

---

## 2. Money handling

### (a) Engineering requirements
- **Integer minor units everywhere** (grosz, `int`/`bigint`), already in the spec (`amount int`). No floats, no `numeric` arithmetic in app code; `DiscountRule.percent numeric` is a *rate*, the resulting `discount_amount` must be an integer computed once and stored on the charge.
- **Rounding rule**: half-up to the grosz on the final discounted amount, computed in one place (`payments.pricing.ts`), with the rule name recorded on the charge (`rounding: 'half_up'`). For allocations that split one amount across many lines (e.g. one transfer covering three sibling charges, or a set product with components), use **largest-remainder allocation**: distribute integer grosz, give leftover grosz to the largest fractional remainders, assert the sum equals the original. Unit-test with amounts like 100 PLN at 33 %, 3 × 33.33.
- **Charge/payment model, not full double-entry**: the spec's `Charge` + `Payment` (+ `reverse` command) is a "double-entry-light" ledger: a payment is an immutable credit against a charge; corrections are reversing entries (negative payments linked by `reverses_payment_id`). Required invariants: `Σ payments(charge) ≤ charge.amount − discount` unless `overpayment` is explicitly recorded as a separate credit row; `Charge.status` is derived from the sum, never set by hand. Add a nightly `payments:verify-invariants` job that recomputes balances and reports drift.
- **Idempotent payment recording**: unique `(gateway_transaction_id, charge_id)` (in spec) + a `gateway_events` table keyed by Stripe `event.id` (insert-first, unique) so a replayed webhook is a no-op. Manual cash: unique `receipt_number` per club (in spec) plus client-supplied `operation_id` UUID in the command to make the UI retry-safe.
- **Reconciliation design (import → match → book → undo)**:
  1. *Import*: parse file into `payments_bank_transactions`; `tx_hash` = SHA-256 of normalised (`account`, `booked_on`, `amount`, `title`, `counterparty_account`, bank reference if present); unique per club → re-importing the same statement is idempotent.
  2. *Match* in passes, each pass tagged in `match_reason`: (1) exact payer code (`PayerRef.code`) found in title → candidate charges of that payer; (2) IBAN previously confirmed for that payer; (3) fuzzy: amount equals one open charge or a sum of open charges of a payer whose surname token appears in the title/counterparty; (4) nothing → `unmatched`. Pass (1)+(2) with amount equal to open charges → `auto_booked` if `auto_book_bank_matches` (spec setting); pass (3) → `suggested` only.
  3. *Book*: one command creates N `Payment` rows from `allocation[]` inside one unit of work; the bank transaction's status flips to `booked` with the same version check (409 on conflict).
  4. *Undo*: `payments.bank_transactions.unbook` reverses the linked payments (reversing entries, not deletes, when a receipt or handover already references them; hard-remove only if nothing downstream references them and the import is not closed) and returns the row to `suggested/unmatched`. Keep the spec's rule "undo removes the linked payments" but implement as reversal when `receipt_number` or `cash_handover_id` is set.
  5. Never create "plug" entries to force a balance; show residuals as `unmatched` or `overpayment` credit.
- **Audit trail**: append-only `payments_audit` (actor, acting_role, command, entity, before/after hash, version, `occurred_at`); monetary rows have no UPDATE path except status columns via commands.
- **Formatting**: `Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' })` → `1 234,56 zł`; `en` locale → `PLN 1,234.56`. Convert from grosz at the view boundary only (`amount / 100` is safe for display; never for math). Use `Intl.NumberFormat` `formatToParts` when you need the symbol separately.
- **Polish bank files**: support CSV with a per-bank **column profile** (spec `column_profile jsonb`) and MT940. Realities: there is no single MT940 — field `:86:` layouts differ (mBank free-text with leading code; BNP/PKO use `^20`, `^21`, `^32`… sub-fields); PKO fixes `:20:` to `MT940` and uses a comma decimal; ERP vendors ship separate profiles per bank (Comarch lists MT940 standard/BGŻ/BRE/Idea/PBS). CSV exports often use Windows-1250 or ISO-8859-2 and `;` separators — detect encoding (BOM, heuristic on Polish diacritics) and let the treasurer confirm the mapping once per bank; store the profile.
- **KP (kasa przyjmie) receipts**: art. 21 uor requires a voucher to contain at least: type and number, parties, description and value of the operation, date (and issue date if different), signatures of issuer and payer/receiver, and the booking annotation; some signatures may be omitted under art. 21(1a). Electronic form is acceptable. Numbering must be continuous and gap-free per series and year — generate `KP/YYYY/NNNN` from a per-club sequence row locked in the transaction (`SELECT … FOR UPDATE`), never from `max()+1`. Store `collected_by_person_id`, `payer`, `charges[]`, `amount`, `issued_at`; e-mail a PDF (spec: KP confirmation e-mail). Cash handovers `RG/YYYY/MM/NNN` likewise sequenced. Whether the club keeps full books or the simplified ledger (UEPiK, revenue ≤ 100 000 zł prior year; an increase to 1 mln zł was proposed in Dec 2025) changes the accountant's needs, not the receipt content — confirm with the accountant (spec Q-034).

### (b) Evidence
- Stripe idempotency keys: https://docs.stripe.com/api/idempotent_requests [official, fetched] — `Idempotency-Key`, ≤255 chars, 24 h retention, parameter mismatch → error, POST only, avoid PII in keys.
- Stripe webhook ordering/dedupe: https://docs.stripe.com/webhooks [official, fetched] — no ordering guarantee; dedupe on `event.id`; `created` has 1-second resolution.
- Reconciliation passes/fuzzy/no-plug guidance: https://tray.ai/automate/bank-reconciliation/ and https://eco.com/support/en/articles/16895982-payment-reconciliation-a-practical-guide [secondary].
- MT940 specs: mBank https://www.mbank.pl/pdf/msp-korporacje/bankowosc-elektroniczna/mbank-korpo-description-of-the-mt940-daily-statement-file-format.pdf; PKO BP https://www.pkobp.pl/media_files/a5e89f72-0dba-41e4-9b49-03a880901934.pdf; BNP https://www.bnpparibas.pl/_fileserver/item/1504996 [official bank docs, search snippets]; Comarch per-bank profiles https://pomoc.comarch.pl/xl/hr/pl/2024_5/index.php/dokumentacja/formularz-banku-zakladka-import-eksport [vendor]. Encoding claim (cp1250/ISO-8859-2) is experience-based, not sourced — validate with sample files from the club's bank.
- Art. 21 uor voucher elements: https://lexlege.pl/ustawa-o-rachunkowosci/art-21/ and https://standardyprawa.pl/akt/459/art/52507 [legal text mirrors]; https://poradnikprzedsiebiorcy.pl/-dowod-ksiegowy-jakie-sa-jego-wymagania-formalne [secondary].
- Simplified ledger for NGOs: https://ksiegowosc.infor.pl/rachunkowosc/ewidencja-ksiegowa/737324,Uproszczona-ewidencja-przychodow-i-kosztow-dla-organizacji-pozarzadowych-i-stowarzyszen.html [secondary]; MF regulation Dz.U. 2018 poz. 2050 https://www.infor.pl/akt-prawny/DZU.2018.209.0002050,... [legal]; 1 mln proposal https://zpp.pl/storage/library/2025-12/fb0c25a3c75691753f005a746ce3a441.pdf [secondary, draft].
- Intl.NumberFormat: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/NumberFormat/NumberFormat [official]; CLDR `pl` currency pattern `#,##0.00 ¤` (ICU data) [official data].

### (c) Pitfalls
- Storing `percent` discounts and recomputing at display time → amounts drift when the rule changes (spec already freezes `discount_amount`; keep it).
- `max(receipt_number)+1` under concurrency → duplicate KP numbers (a legal problem, not just a bug).
- Treating bank `title` as reliable: parents write "składka Kuba" — the payer code must be printed on every charge e-mail and the UI must make it copy-able.
- Re-importing an overlapping date range creates duplicates unless `tx_hash` ignores volatile fields (some banks regenerate references).
- Deleting payments on undo after a KP was e-mailed → the receipt references a non-existent payment; reverse instead.
- Formatting with `toFixed(2)` or locale-less output; `0.1 + 0.2` style errors when someone "temporarily" divides by 100 in business code.

---

## 3. Stripe integration (2025–2026)

### (a) Engineering requirements
- **Use Checkout Sessions (hosted page) first**, Payment Element only if on-site UX is required; Stripe's own docs recommend Checkout Sessions API (and Checkout Sessions + Payment Element over raw Payment Intents). For a club paying parents, hosted Checkout gives SCA/3-DS, BLIK and P24 UI, receipts and the smallest PCI scope (SAQ A-type: card data never touches Vereino servers).
- **Polish methods** (both official, fetched 2026-10): **BLIK** — PLN only, customer in PL, Checkout/Payment Links/Elements supported, refunds and partial refunds yes, disputes yes (12-day evidence window), code valid 2 min, 60 s to authorise, recurring supported (off-session). **Przelewy24** — PLN or EUR, min 0.50 EUR, Checkout Sessions recommended, refunds/partials yes (180-day window, async up to 3 business days, cannot be cancelled, appear as a separate credit), **no disputes**, customer must authorise within 1 h of checkout, merchant website must display address, tax ID, registration number, refund policy, privacy policy, ToS. MCC **7941 Sports Clubs/Fields is "Restricted"** for P24 → expect an additional-information request at activation. Enable both in Dashboard → payment method settings; let Checkout's dynamic payment methods pick them by currency. This answers the spec's Q-016 ("no BLIK/P24 in gateway_stripe facts"): Stripe supports them; the open question is whether the Open Mercato `gateway_stripe` module passes `payment_method_types`/dynamic methods through — verify in V-5.
- **Webhooks**: verify `Stripe-Signature` (HMAC-SHA256 over `t.rawBody`) using the official library on the **raw body**; default tolerance 5 min — never 0; use NTP. Return 2xx fast, enqueue processing. Handle `checkout.session.completed` **and** `checkout.session.async_payment_succeeded`/`async_payment_failed` (P24 can complete asynchronously; `payment_status` may be `unpaid` at `completed`). Fulfil only when `payment_status != 'unpaid'`. Stripe retries up to 3 days (live) with backoff; sandbox: 3 retries over a few hours. No ordering guarantee; dedupe on `event.id` (unique column) and additionally on (`data.object.id`, `event.type`). Roll signing secrets periodically (24 h dual-secret window). Allowlist Stripe IPs if the host allows. Exempt the webhook route from CSRF.
- **Idempotency on outbound calls**: send `Idempotency-Key` (UUID v4 stored on `payments_checkouts.create_idempotency_key`) when creating Checkout Sessions/refunds; 24 h retention; parameter mismatch returns an error — don't reuse keys across different payloads.
- **Checkout session lifecycle**: store `gateway_transaction_id` = session id (unique, in spec); set `success_url` with `{CHECKOUT_SESSION_ID}` and also run the same idempotent `fulfill_checkout(session_id)` on landing (Stripe waits ≤10 s for the webhook before redirect). Keep `metadata.charge_ids`, `metadata.organization_id`, `metadata.tenant_id` and `client_reference_id` = checkout row id so the webhook can scope without trusting the body (scope from the checkout row, as the spec requires for sessionless flows).
- **Refunds**: Stripe fees are not returned; refund fails → `refund.failed` with `failure_reason`; refunds go only to the original method; customer sees credit in ~5–10 business days (cards), BLIK often immediate. Model refunds as reversing `Payment` rows with `method='online_refund'`, `gateway_transaction_id` = refund id; listen to `refund.created/updated/failed` and `charge.refunded`.
- **SCA**: handled by Checkout; nothing to build, but never store card data; show the Stripe receipt or your own KP-style confirmation.
- **Testing**: use **general sandboxes** (Stripe recommends over legacy test mode; separate sandboxes for local dev and CI; separate API keys and webhook endpoints per sandbox). Use `stripe listen --forward-to` locally and `stripe trigger checkout.session.completed`. Test P24/BLIK via the test payment method pages.
- **PCI scope**: with hosted Checkout the merchant still must: serve pages over TLS 1.2+, keep Stripe.js from `https://js.stripe.com` (CSP: `frame-src https://checkout.stripe.com`, `script-src https://checkout.stripe.com`), store only non-sensitive card metadata (brand, last4, exp), attest annually in Dashboard (SAQ A). Secrets: restricted keys per environment; never in repo (spec already).

### (b) Evidence
- Webhooks: https://docs.stripe.com/webhooks [official, fetched 2026-10-21] (5-minute tolerance, 3-day retries, no ordering, event-id dedupe, raw body, secret rolling, IP allowlist).
- Fulfilment: https://docs.stripe.com/checkout/fulfillment?payment-ui=stripe-hosted [official, fetched] (async_payment_succeeded, `payment_status`, run-once fulfilment, 10 s wait before redirect).
- BLIK: https://docs.stripe.com/payments/blik [official, fetched]. P24: https://docs.stripe.com/payments/p24 [official, fetched] (MCC 7941 restricted, website requirements, 180-day refund window, no disputes).
- Idempotent requests: https://docs.stripe.com/api/idempotent_requests [official, fetched]. Refunds: https://docs.stripe.com/refunds [official, fetched]. Security/PCI/CSP: https://docs.stripe.com/security/guide [official, fetched]. Sandboxes: https://docs.stripe.com/sandboxes [official, fetched].
- Checkout vs Element guidance: https://docs.stripe.com/payments/payment-element/best-practices [official, search]; https://dev.to/stripe/making-sense-of-stripe-checkout-payment-links-and-the-payment-element-23o5 [Stripe DevRel, secondary].
- Practitioner notes on out-of-order/duplicate events: https://www.stigg.io/blog/best-practices-i-wish-we-knew-when-integrating-stripe-webhooks [secondary].

### (c) Pitfalls
- Body-parsing middleware (Next.js route handlers must read `await req.text()`, not `req.json()`) → signature failures.
- Marking a charge paid on `checkout.session.completed` without checking `payment_status` → P24 payments that never settle are shown as paid.
- Relying on the success page redirect for fulfilment (users close the tab; BLIK users pay in the bank app).
- Enabling P24 before the public club page has address/NIP/KRS/refund policy — Stripe can restrict the capability.
- Refund bookkeeping as "edit the payment" — breaks the no-edit rule and KP trail.
- Testing against the legacy test-mode with shared webhook secrets across local and CI → events from one developer hit another's handler.

---

## 4. Multi-tenant isolation on PostgreSQL with MikroORM

### (a) Engineering requirements
- **Layer 1 (application)**: tenant columns `tenant_id` + `organization_id` on every row (spec), injected by a **MikroORM global filter** (`em.addFilter('tenant', …)`, default enabled, params set per request from the auth context). Facts that matter: filters apply to `find*`, `count`, `nativeUpdate`, `nativeDelete` and — since v6 — to relation joins; **they do not apply to QueryBuilder unless `qb.applyFilters()` is called, nor to raw SQL**. Ban raw SQL in modules except in a reviewed `repositories/raw/` folder; lint rule for `createQueryBuilder` without `applyFilters`. Use `strict: true` filters for tenant checks so a filtered-out relation also drops the owner row.
- **Layer 2 (database)**: enable **RLS** on all tenant tables with a `RESTRICTIVE` policy on `current_setting('app.tenant_id', true)::uuid` (and org); MikroORM 7 can compile an entity filter into an RLS policy (`rls: true` on PostgreSQL) — evaluate it in V-x before hand-writing policies. Rules from the PostgreSQL 17 docs: superusers and `BYPASSRLS` roles always bypass; **table owners bypass unless `FORCE ROW LEVEL SECURITY`**; RLS enabled with no policy = default deny; FK/unique checks bypass RLS (covert-channel risk — unique indexes must include `organization_id` so a collision cannot reveal another tenant's data); set `row_security = off` in backup jobs so a misconfigured role errors rather than silently dumping a subset.
- Run the app as a dedicated **non-owner, `NOBYPASSRLS`** role; migrations as the owner role. Set the tenant GUC inside the transaction (`SET LOCAL app.tenant_id = …`) on every request/job; with a pooler (PgBouncer transaction mode) never use session-level `SET`. The spec's single system-scope lookup (DD-35/V-12) must run under a role/policy that permits only the slug/token-hash index read (`SECURITY DEFINER` function returning ids, `LEAKPROOF` not required).
- **Indexes**: tenant-first composite indexes `(organization_id, …)` as the spec already lists; verify with `EXPLAIN` on real list queries — the planner can pick a worse `(tenant_id, status)` index for `IN` queries than `(tenant_id, id)`. Partial indexes for hot status filters (`WHERE status IN ('suggested','unmatched')`).
- **Per-tenant encryption keys**: envelope encryption — a per-organization KEK (wrapped by the platform master key from env/KMS), per-record DEKs or per-table DEKs wrapped by the KEK; destroying the org KEK = crypto-shredding of that tenant (tenant offboarding and the part of GDPR erasure that survives retention). Store `key_version` next to ciphertext; rotation = re-wrap DEKs, not re-encrypt data. Keep the HMAC key for PESEL dedupe per tenant too.
- **Backup/restore per tenant**: full-instance PITR (see §8) plus a logical per-tenant export job (`pg_dump --table … --where` is not available; use `COPY (SELECT … WHERE organization_id=$1)` per table into an encrypted archive) for offboarding/restore-one-club. Restore one tenant = restore PITR into a sibling service, export that tenant, import into prod under a transaction with the tenant filter — drill it (§8).
- **Noisy neighbour**: `statement_timeout` (e.g. 5 s API, 60 s jobs) per role; per-tenant rate limits on public routes (spec V-10) and on expensive endpoints (reports, imports); job concurrency limits per tenant in the queue (BullMQ group/limiter or a per-tenant lock); `work_mem` sane; one import at a time per club (advisory lock `pg_advisory_xact_lock(hash(org_id))`).

### (b) Evidence
- MikroORM filters: https://mikro-orm.io/docs/filters [official, fetched] (filters on relations since v6, QueryBuilder needs `applyFilters()`, raw queries unfiltered, `rls: true` compiles to a policy on PostgreSQL).
- PostgreSQL 17 RLS: https://www.postgresql.org/docs/17/ddl-rowsecurity.html [official, fetched] (BYPASSRLS, FORCE ROW LEVEL SECURITY, default deny, permissive vs restrictive, RI bypass, `row_security=off`).
- RLS footguns (owner bypass, superuser tests, security-invoker views): https://www.bytebase.com/blog/postgres-row-level-security-footguns/ [secondary]; https://pganalyze.com/blog/5mins-postgres-row-level-security-bypassrls-security-invoker-views-leakproof-functions [secondary].
- Index choice thread: https://www.postgresql.org/message-id/1632141196.287783798@f377.i.mail.ru [pgsql-performance list].
- Envelope/crypto-shredding: https://www.mongodb.com/docs/v8.0/core/csfle/tutorials/right-to-erasure/ [official vendor]; https://www.conduktor.io/glossary/crypto-shredding-for-kafka [secondary].

### (c) Pitfalls
- Testing RLS as the superuser/owner → policies appear to work but are bypassed in tests and in prod if the app connects as owner.
- Session-level `SET app.tenant_id` with transaction pooling → tenant bleed between requests.
- Views created by the owner are `SECURITY DEFINER` by default (bypass RLS) — use `security_invoker` (PG15+).
- Unique constraints without the org column leak existence (RI bypass).
- Forgetting the tenant GUC in schedulers/workers (spec requires scope in the job payload — pair it with `SET LOCAL`).
- "Per-tenant key" implemented as a column of plaintext keys in the same database.

---

## 5. Transactional e-mail, deliverability, personal links

### (a) Engineering requirements
- **Domain setup**: send from a dedicated **subdomain** (`mail.<club-platform>.pl` or per-club `klub.<platform>.pl`), not the root; Resend recommends this to isolate reputation. Configure DKIM (Resend-provided), SPF via the custom Return-Path subdomain, **DMARC** on the sending domain starting `p=none` with `rua=` reporting, moving to `p=quarantine` after 2–4 weeks of clean reports; `From:` domain must align with the DKIM/SPF domain. Enable "enforce TLS". Disable open/click tracking for transactional mail (link rewriting also breaks personal-link trust and leaks to the tracker). Choose region `eu-west-1`.
- **Gmail/Yahoo requirements** (official, in force since Feb 2024): all senders: SPF or DKIM, valid PTR, TLS, spam rate < 0.3 % (aim < 0.1 %), RFC 5322; bulk senders (≥5 000/day to Gmail): SPF **and** DKIM, DMARC (p=none ok), alignment, **one-click unsubscribe** (`List-Unsubscribe: <https://…>` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, RFC 8058) for *marketing/subscribed* mail, honoured within 2 days (Yahoo). Club announcements are "subscribed" mail → add both headers and a visible unsubscribe/notification-preferences link; transactional mail (KP receipt, booking confirmation, declaration link) does not need it. Implement the POST endpoint without auth, keyed by a signed per-recipient token; it must not require a login or a confirmation page.
- **Bounce/complaint handling**: subscribe to Resend webhooks `email.bounced`, `email.complained`, `email.delivery_delayed`, `email.failed`, `email.suppressed`, `email.delivered`; verify Svix signature on the raw body (`svix-id`, `svix-timestamp`, `svix-signature`), dedupe on `svix-id`. On hard bounce or complaint → set `email_status` on the person (`bounced`/`complained`), stop announcements, show a badge to the coordinator (spec `messages.message.email_failed` → "not delivered" status). Resend auto-suppresses bounced/complained addresses — also keep your own suppression list so a changed provider behaves the same.
- **Rate limits**: Resend default **10 requests/s per team** (429 above). Announcements to a 200-person club must go through a queue with a token bucket (≤8/s), using the batch endpoint where possible, and must be idempotent per (message id, recipient) via `Idempotency-Key` (1–256 chars, 24 h, 409 on payload mismatch).
- **Templates and localisation**: templates in the repo (React Email or MJML), keyed by `notification type + locale`; subject and preheader localised; plain-text alternative always; club name and reply-to set per tenant; never include the full personal token in a subject. Preview/golden tests per locale (`pl`, `en`).
- **Magic/personal links (declaration, order, booking confirmation)**: token ≥ 128 bits from CSPRNG (`crypto.randomBytes(32)` base64url), store only SHA-256 (spec DD-17) — compare in constant time; scope the token to one purpose + one guardian + one session/campaign (spec); expiry = end of the session/campaign; **single-use for state-changing actions** (declaration submit) or short-lived view sessions; invalidate on use and on guardian change; `Referrer-Policy: no-referrer` on token pages; build URLs from config, not `Host` header; always `202` on link requests (spec) with uniform timing; per-e-mail and per-IP rate limits on request endpoints; never put the token in logs or analytics. Token page must not issue a full login session.

### (b) Evidence
- Gmail sender guidelines: https://support.google.com/a/answer/81126 [official, fetched] (SPF/DKIM, PTR, TLS, 0.3 %, DMARC for bulk, one-click headers per RFC 8058). Yahoo/Resend summary: https://resend.com/docs/knowledge-base/how-do-i-avoid-yahoos-spam-folder.md and https://www.resend.com/blog/gmail-and-yahoo-bulk-sending-requirements-for-2024 [official vendor].
- Resend domains/subdomains: https://resend.com/docs/dashboard/domains/introduction [official, fetched]; regions https://resend.com/docs/dashboard/domains/regions [official, fetched]; rate limit https://resend.com/docs/api-reference/introduction [official, fetched]; idempotency https://resend.com/docs/dashboard/emails/idempotency-keys [official, fetched]; webhook events https://resend.com/docs/dashboard/webhooks/event-types [official, fetched]; verification https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests [official, fetched].
- OWASP Forgot Password Cheat Sheet (token rules, enumeration, no-referrer, rate limits): https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html [official, fetched].
- Magic-link entropy/expiry guidance: https://mojoauth.com/blog/are-magic-links-secure-technical-deep-dive [secondary, vendor].

### (c) Pitfalls
- DMARC `p=reject` on day one with a mis-aligned Return-Path → all mail bounces.
- Link tracking enabled → personal links rewritten through the tracker domain; parents' corporate filters pre-fetch links and *consume single-use tokens* (mitigate: GET shows a confirm button, POST consumes).
- Sending 200 announcements in a `Promise.all` → 429s and partial sends; without idempotency keys the retry double-sends.
- One shared sending domain for all clubs: one club's complaint rate hurts all; at least separate the announcement stream from transactional via subdomain.
- Treating `email.delivered` as "read"; treating `delivery_delayed` as failure.

---

## 6. Public pages and anti-abuse

### (a) Engineering requirements
- **Rate limiting** on public/sessionless routes (spec V-10): token bucket in Redis keyed by IP *and* by e-mail/slug (e.g. booking request: 5/h per IP, 3/day per e-mail; link request: 3/h per e-mail; declaration-token page: 60/min per token). Respond 429 with `Retry-After`; never reveal whether the e-mail exists (always 202 — spec).
- **CAPTCHA-free spam defences** (spec says no CAPTCHA; WCAG 3.3.8 also discourages cognitive tests for auth): (1) honeypot field with autocomplete off, hidden via CSS not `type=hidden`, server rejects non-empty silently with 202; (2) time-trap: a signed server timestamp in the form, reject submissions < 3 s or > 24 h; (3) **e-mail verification before any hold** (spec: hold only after confirmation; `pending_verification` purged by scheduler); (4) MX check on the e-mail domain; (5) per-slot one pending request per e-mail; (6) optional proof-of-work or Turnstile behind a club setting only if abuse appears.
- **E-mail verification flow**: request → 202 → mail with single-use token (§5) → confirm page (GET shows button, POST confirms) → `pending_approval`; verification expiry 24 h (spec `verification_expires_at`); resend limited.
- **Caching public schedule pages** (Next.js 16): caching is **opt-in**; enable `cacheComponents: true`, mark the public club/section/facility pages (or their data functions) with `'use cache'` + `cacheLife('minutes')` (short, spec: "short cache"), tag by `club:<slug>` / `place:<slug>` and call `revalidateTag(tag, 'max')` from the `facilities.zone_rules.bulk_updated`, occurrence and publication-settings events (spec already invalidates the facility calendar cache). Add `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` on the public JSON API; `private, no-store` on anything authenticated. No names in the cached payload (spec).
- **Robots/SEO basics**: `robots.txt` allowing `/p/*`, disallowing `/club`, `/backend`, `/api`, token pages; `<meta name="robots" content="noindex">` on token/confirmation pages; canonical URLs per club slug; `sitemap.xml` with public club/section/place pages; Open Graph title/description per club; `lang="pl"`/`"en"` and `hreflang` when both locales are published. Next.js `metadata` API for all of it.
- **Privacy/cookies without analytics**: Polish rule (PKE, in force 10 Nov 2024, succeeding Prawo telekomunikacyjne art. 173) exempts storage *necessary* to deliver a service the user requested; session/auth cookies, CSRF, locale preference (session-scoped) and the rate-limit cookie are exempt → **no consent banner needed** if there is no analytics/ads/third-party embed. Still required: a cookie information section in the privacy policy (purpose, how to control), and the privacy notice itself (art. 13 GDPR) linked from every public page and from the booking form (spec records "data processing notice… with the request"). Stripe Checkout runs on Stripe's domain, so no Stripe cookies on your public pages; if you later embed Stripe.js on your own pages, its cookies are strictly necessary for payment. Any analytics later → opt-in banner.

### (b) Evidence
- Next.js 16 release (opt-in caching, `cacheComponents`, `revalidateTag(tag, profile)`, `updateTag`, `proxy.ts`): https://nextjs.org/blog/next-16 [official, published 2025-10-21, fetched].
- Cookie rules PL: https://twobirds.com/en/trending-topics/global-cookie-review/poland [law firm]; PKE art. 398–400 summary https://edlaw.eduverse.com/docs/jurisdiction/nat/pl/pke [secondary]; WP29 opinion on consent exemption https://hunton.com/privacy-and-information-security-law/article-29-working-party-issues-opinion-cookie-consent-exemption [secondary summary of official opinion 04/2012].
- Honeypot/time-trap/server filtering: https://formnx.com/details/blog/prevent-form-spam-without-captcha and https://splitforms.com/guides/stop-form-spam-bots [secondary, vendor].
- Enumeration-safe responses, rate limits: OWASP Forgot Password Cheat Sheet (above) [official].
- WCAG 3.3.8 Accessible Authentication (no cognitive tests): https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/ [official].

### (c) Pitfalls
- Honeypot made `display:none` *and* named "email" → password managers/autofill fill it, real parents get silently dropped.
- Caching a page that renders differently for a logged-in coach (name visible) → personal data served to guests; keep public pages free of any auth-dependent branch.
- `revalidateTag` without the second argument is deprecated in Next 16.
- Robots allowed on `/p/*/confirm?token=` pages → tokens in search indexes.
- Adding "just Plausible/GA" later without revisiting the banner decision.

---

## 7. Accessibility and mobile UX

### (a) Engineering requirements
- Target **WCAG 2.2 AA** (W3C Recommendation 2023-10-05; 4.1.1 Parsing removed). New AA criteria that bite this product: **2.5.8 Target Size (Minimum)** — pointer targets ≥ 24×24 CSS px or spaced (attendance checkboxes, calendar day cells, "declare" buttons; use 44×44 for primary actions on phones); **2.4.11 Focus Not Obscured** — sticky headers/footers must not hide the focused control; **2.5.7 Dragging Movements** — any drag (calendar move, reorder products) needs a non-drag alternative (move dialog, up/down buttons); **3.3.7 Redundant Entry** — don't make the guardian retype the child's data on the order form (prefill from the ward record); **3.3.8 Accessible Authentication** — no CAPTCHA/puzzle on login or links (consistent with §6); **3.2.6 Consistent Help** (A) — contact/help link in the same place on every page.
- Forms: visible labels (`<label for>`), error text linked by `aria-describedby`, errors announced (`aria-live="polite"`), required marked in text not colour only, `autocomplete` tokens (`given-name`, `email`, `tel`), input `inputmode="numeric"` for codes/amounts, no auto-submit on select.
- Tables (charges, attendance, bank transactions): real `<table>` with `<th scope>`, caption, sortable headers as buttons with `aria-sort`; on narrow screens switch to a card list rather than horizontal scroll with hidden columns; keep row actions reachable by keyboard.
- Calendars: expose as a grid with `role="grid"` only if full keyboard navigation is implemented; otherwise render a list view ("Today / This week") as the default on phones and keep the grid as desktop enhancement; every occurrence is a link with full date/time text (not icons only); colour-coded status also has text/icon.
- Contrast ≥ 4.5:1 text, 3:1 UI components and focus indicators; respect `prefers-reduced-motion`; language attribute per locale; touch targets with ≥ 8 px spacing.
- **Performance budget** for the parent on a mid-range Android over 4G, measured in the field at the **75th percentile per mobile**: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 (Core Web Vitals, unchanged into 2026). Practical budgets: ≤ 150 kB compressed JS on `/club` and token pages, server-render the first screen, no client-side data waterfall for "Today", `next/image` with explicit sizes (CLS), fonts `display: swap` with a system fallback, avoid heavy calendar libs on the mobile list view. Add Lighthouse CI with mobile throttling (Moto G4-class) as a PR check and Web Vitals reporting (`web-vitals` → your own endpoint, no third-party analytics).
- **PWA**: ship a manifest (`name`/`short_name`, 192 and 512 px icons incl. maskable, `start_url=/club`, `display=standalone`, `theme_color`, `lang`) and HTTPS → installable in Chrome (user-engagement heuristic: a click + 30 s). A service worker is **not** needed for installability; add one only for (a) offline shell for the attendance page a coach opens on a pitch with poor signal, (b) web push later (spec dropped push from 1.0). If added: Workbox, network-first for data, cache-first for static, versioned precache; never cache authenticated JSON without the user id in the cache key.

### (b) Evidence
- WCAG 2.2 new criteria/levels: https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/ [official, fetched; published 2023-10-05].
- Core Web Vitals: https://web.dev/articles/vitals [official, fetched; updated 2024-10-31] (2.5 s / 200 ms / 0.1, p75 per device, field first). Thresholds unchanged 2026: https://cdn.jsdelivr.net/npm/bmad-plus@0.9.0/src/bmad-plus/packs/pack-seo/ref/cwv-thresholds.md [secondary].
- Install criteria: https://web.dev/articles/install-criteria [official, fetched] (manifest fields, HTTPS, engagement; SW not listed); MDN https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_Installable [official-ish, SW not required].

### (c) Pitfalls
- Icon-only attendance toggles under 24 px in a dense list; checkboxes without visible labels.
- Sticky "Save attendance" bar covering the last focused row (2.4.11).
- Drag-to-move bookings in the facility calendar with no dialog alternative.
- Measuring only Lighthouse on a laptop; CWV passes are decided by field p75 on phones.
- A service worker that caches `/club` HTML for user A and serves it to user B on a shared device.

---

## 8. Operations for a two-person team

### (a) Engineering requirements
- **Postgres backups on Railway**: use all three layers — (1) **PITR**: pgBackRest WAL archiving to a Railway bucket, weekly full + daily differential, window ≈ last 4 full backups (~4 weeks), restore creates a *new sibling service* `<src>-restored-…`, cut-over is manual; not retroactive (starts at first base backup after enabling); use major-tag images (`postgres-ssl:17`) because minor pinning is unsupported; (2) **volume snapshots** (scheduled, incremental); (3) **nightly logical `pg_dump -Fc`** to an off-Railway encrypted bucket (different provider/account) for provider-failure and tenant-export cases. Store backup encryption keys outside Railway.
- **Restore drills**: quarterly, scripted: restore PITR to T-1h into a sibling, run `scripts/verify-restore.ts` (row counts per tenant, invariant job from §2, a known KP number), time it, record RTO/RPO achieved in `docs/ops/restore-drills.md`. Also drill the logical dump into a local Docker PG17. Target: RPO ≤ 5 min (WAL), RTO ≤ 60 min.
- **Redis**: volume mounted at `/data`; `--appendonly yes --appendfsync everysec`; `maxmemory-policy noeviction` (BullMQ requires it; Railway guide says it is the default); Redis ≥ 7. Treat queue state as *recoverable*, not durable: every job is idempotent and re-derivable from Postgres (spec already keys subscribers by entity id + version). Note the Railway template does not create the volume automatically.
- **Secrets**: Railway service variables; **sealed** variables for production secrets (not viewable/API-retrievable, not copied to PR environments or duplicated environments); shared variables + references for non-secret config; separate non-sealed test credentials for PR/staging. Never commit `.env`; `.env.example` with placeholder names; rotate Stripe webhook secrets and API keys on staff change; restricted Stripe keys per environment.
- **Environments**: `dev` (local Docker: PG17, Redis, Stripe CLI listener, Mailpit), `staging` (Railway environment, Stripe sandbox A, Resend test domain, seeded demo club), `prod` (Stripe live, sealed secrets, PITR on). PR environments optional; if used, no sealed secrets and no real e-mail (Resend test addresses). Migrations run as a release step with a lock; schema changes backward-compatible for one release (expand/contract).
- **Monitoring, light on-call**: uptime check on `/healthz` (DB + Redis ping) from an external monitor; error tracking (Sentry-class, PII scrubbed); log-based alerts: webhook signature failures, queue backlog > N for 10 min, failed jobs, 5xx rate > 1 % for 5 min, Postgres disk > 80 %, PITR archive lag; weekly digest instead of pager for non-urgent. On-call = "best effort during Polish daytime, 24 h response", written in the status/SLA page.
- **SLOs** (honest, slightly below achieved): availability 99.5 %/30 d for the app (≈ 3.6 h budget), 99.9 % for the Stripe webhook endpoint; error rate < 0.5 % of requests; e-mail delivery attempt within 5 min of event. Error-budget policy: when budget is gone, freeze non-essential deploys until a postmortem lands.
- **Incident/postmortem template** (`docs/ops/postmortem-template.md`): title, date, severity, impact (who/what/how long), timeline (UTC), detection, root cause(s), contributing factors, what went well, action items with owners and dates, blameless wording; link the breach register entry if personal data was involved (§1).
- **Dependency cadence**: Renovate/Dependabot weekly grouped minor/patch; security advisories within 48 h; major upgrades (Next, MikroORM, Node) quarterly with a staging soak; Node 20.9+ required by Next 16; pin Docker base images by digest; `npm audit`/`osv-scanner` in CI.

### (b) Evidence
- Railway PITR: https://docs.railway.com/volumes/point-in-time-recovery [official, fetched] (pgBackRest, weekly full/daily diff, ~4 weeks, sibling restore, limitations). Backups guide: https://docs.railway.com/guides/postgres-backups-restores [official]. CLI `railway postgres pitr`: https://docs.railway.com/cli/postgres [official].
- Railway Redis guide: https://docs.railway.com/guides/redis-cache-vs-store [official] (volume at `/data`, AOF everysec, noeviction); community data-loss thread https://station.railway.com/questions/redis-persistence-between-maintenances-1d19dece.
- BullMQ production guide: https://docs.bullmq.io/guide/going-to-production [official] (AOF everysec, noeviction mandatory, Redis ≥ 6.2, 7+ recommended).
- Railway variables/secrets: https://docs.railway.com/variables and https://docs.railway.com/guides/managing-secrets-on-railway [official] (sealed variables not copied to PR envs; layered approach). Community caveat on sealed sync: https://station.railway.com/questions/sealed-environment-variables-are-behavin-9ea8da1d.
- SRE error budget policy example: https://sre.google/workbook/error-budget-policy/ [official Google SRE Workbook]; small-team SLO pragmatism: https://jacar.es/en/the-site-reliability-workbook-patterns-we-still-use/ [secondary].
- Next.js 16 Node 20.9+ requirement: https://nextjs.org/blog/next-16 [official].

### (c) Pitfalls
- Enabling PITR and assuming yesterday is covered — the window starts at the first base backup after enabling.
- Restoring in place: Railway PITR never touches the source; the cut-over (connection string swap) is where mistakes happen — script it.
- Redis without a volume → queue and rate-limit state vanish on maintenance.
- Sealed variables silently missing after "duplicate environment" → prod boots with staging credentials.
- Alerts on everything → pager fatigue for two people; alert on symptoms (SLO burn), log the rest.

---

## 9. Open-source project hygiene (MIT)

### (a) Engineering requirements
- `LICENSE` (MIT, copyright holder = the legal entity/persons), `NOTICE` optional for MIT but useful to list bundled third-party licences (Open Mercato's licence must be compatible — verify before publishing; if it is not MIT/Apache, document the boundary).
- `CONTRIBUTING.md`: how to run locally (Docker compose, seed club), branch/PR flow, commit style, DCO sign-off requirement, test expectations, i18n rule (both `pl` and `en` strings), security rule (no PII in fixtures), "spec first" rule for product changes.
- `CODE_OF_CONDUCT.md`: Contributor Covenant **3.0** (released 2025-07-28; restorative "Addressing and Repairing Harm" section; adopted by Hanami, Electron PR) or 2.1 if you prefer the widely known text; name two contacts.
- `SECURITY.md` in root (GitHub surfaces it under Security tab): supported versions, how to report (GitHub **Private Vulnerability Reporting** enabled + security@ address), what to include, acknowledgement within 3 business days, fix/disclosure target 90 days, coordinated disclosure, no bug bounty, safe-harbour sentence. Enable Dependabot alerts and secret scanning.
- Issue/PR templates: `.github/ISSUE_TEMPLATE/bug.yml`, `feature.yml`, `config.yml` (links to discussions/security), `PULL_REQUEST_TEMPLATE.md` with checklist (tests, i18n, migration, spec traceability REQ-id, DCO).
- **DCO, not CLA**: DCO 1.1 (`Signed-off-by:` trailer, enforced by the DCO GitHub app) is the right fit for a two-person MIT project with outside contributors: minimal friction, puts the provenance assertion on the contributor, no relicensing optionality lost that MIT does not already give (inbound = outbound). A CLA only matters if you plan a proprietary edition or foundation donation — state in `GOVERNANCE.md` that you do not.
- **Versioning/changelog**: SemVer 2.0.0; `CHANGELOG.md` in Keep a Changelog format (Unreleased/Added/Changed/Fixed/Security), generated from Conventional Commits via release tooling (changesets or release-please); tag releases, GitHub Releases with migration notes; data-migration-breaking changes = major.
- **Governance** (`GOVERNANCE.md`): two maintainers with equal merge rights; decisions by consensus, tie → the product owner; outside contributors become "committers" after N merged PRs; review required from one maintainer for every PR, two for `payments`/`auth`/migrations; CODEOWNERS; roadmap in GitHub Projects; public spec in `.ai/specs` with the ADR log.

### (b) Evidence
- SECURITY.md and private reporting: https://docs.github.com/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability and https://help.github.com/articles/adding-a-security-policy-to-your-repository [official GitHub]; minimal real example https://git.shadowfacts.net/shadowfacts/fonttools/commit/05dc231072c6ee04c42cbc496f22ae4e74270aa8.
- DCO 1.1: https://developercertificate.org/ [official, fetched]. DCO vs CLA argument: https://writing.kemitchell.com/2021/07/02/DCO-Not-CLA [secondary, lawyer]; https://beancount.io/blog/2026/10/13/cla-vs-dco-contributor-agreement-open-source-project-guide [secondary].
- Contributor Covenant 3.0: https://ethicalsource.dev/blog/contributor-covenant-3 [official, 2025-07-28]; adoption https://hanakai.org/blog/2025/09/02/hanami-adopts-contributor-covenant-3-0.
- Keep a Changelog 1.1.0 (https://keepachangelog.com/en/1.1.0/) and SemVer 2.0.0 (https://semver.org/) — well-known, not fetched this session.

### (c) Pitfalls
- Publishing fixtures/seeds with real-looking Polish names + PESEL-like numbers (use obviously fake data; PESEL checksum-valid but flagged test range).
- Accepting PRs without sign-off and later discovering an employer's IP claim.
- Security contact = personal mailbox of one maintainer who leaves.
- CHANGELOG written only in git log; users of a self-hosted club app need migration notes per release.

---

## 10. Scheduling and calendar correctness

### (a) Engineering requirements
- **Model**: `Activity` holds `rrule` (RFC 5545 string, no DTSTART inside), `dtstart_local` (wall-clock), `duration_minutes`, `timezone = 'Europe/Warsaw'` (club setting), `exdates[]`, `rdates[]`, `until`/`count`; generated `Occurrence` rows (`activity_id`, `occurrence_date`, `starts_at timestamptz`, `ends_at timestamptz`, `is_detached`, `version`) with the spec's unique (`activity_id`, `occurrence_date`).
- **Expansion in the club's zone, store instants**: use rrule.js only for *date/wall-clock* enumeration, then convert each wall-clock to an instant with a tz library (Luxon `DateTime.fromObject({...}, { zone })` or `Temporal` when stable in Node). rrule.js specifics: it works on "floating"/UTC `Date`s — construct with `datetime()`/`Date.UTC` and read with `getUTC*`; `tzid` support depends on the runtime `Intl`; versions after 2.7.2 have reported regressions with `after()` when `tzid` is set; pin the version, test March/October transitions. Training "17:00 every Tuesday" must stay 17:00 local across DST (weekly offset changes from +01:00 to +02:00); storing fixed UTC would shift it by an hour (spec Risk row already names this).
- **DST edge cases**: a wall time inside the spring gap (02:30 on the last Sunday of March) → shift forward (Luxon default); an autumn ambiguous time → pick the first (earlier) offset; document both. Tests: TEST for week of 2026-03-29 and 2026-10-25, plus a Monday 00:00–00:30 activity.
- **Idempotent generation** (`activities:generate-occurrences`, daily 03:00, horizon e.g. 8 weeks): compute the set for `[today, horizon]`, upsert by (`activity_id`, `occurrence_date`) with `ON CONFLICT DO NOTHING` for new rows; for existing non-detached rows without attendance/substitution update `starts_at/ends_at` if the rule changed (keep `is_detached` and attendance-bearing rows untouchable — spec); rows beyond the horizon are not created; removal of future rows when the rule shrinks only if untouched. A rule edit bumps `activity.version`; occurrences store `generated_from_version` to make regeneration explainable.
- **Conflict detection**: resource = place/zone + coach + group. Query with `tstzrange(starts_at, ends_at) && tstzrange($1,$2)` on a GiST index (`EXCLUDE USING gist (place_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE (status in ('confirmed','planned'))` for hard exclusivity on facility bookings; soft warnings for coach double-booking). Buffer minutes as a setting. Closures (`facilities.closure.created`) mark overlapping occurrences `needs_reschedule` (spec).
- **iCal export** (per guardian/coach, token URL): `VCALENDAR` with `VTIMEZONE` for `Europe/Warsaw` (STANDARD/DAYLIGHT with TZOFFSETFROM/TO), `DTSTART;TZID=Europe/Warsaw:` local form for the series **or** export already-expanded occurrences as individual `VEVENT`s in UTC (`Z`) — simpler and matches the generated table; exceptions as `RECURRENCE-ID` with the same `UID`; cancelled → `STATUS:CANCELLED`; stable `UID` = `occurrence_id@<domain>`; `SEQUENCE` = version; no names of other participants. Token-protected feed URL (§5), cache 5 min, `Content-Type: text/calendar; charset=utf-8`.

### (b) Evidence
- rrule.js README (UTC/floating dates, `datetime()`, `tzid` via Intl, caching, limitations): https://github.com/jkbrzt/rrule [official repo, fetched]. Issues: tz parse bug https://github.com/jkbrzt/rrule/issues/523; `after()` regression >2.7.2 with tzid https://github.com/jkbrzt/rrule/issues/608 [official issue tracker]. npm page returned 403 this session — check current version before pinning.
- RFC 5545 recurrence set and VTIMEZONE: https://icalendar.org/iCalendar-RFC-5545/3-6-5-time-zone-component.html [RFC mirror]; RECURRENCE-ID practice https://nylas.com/blog/calendar-events-rrules/ [secondary]; RRULE/RDATE/EXDATE guide https://itime.day/articles/rrule-rdate-exdate-guide [secondary].
- DST drift description: https://git.rose-ash.com/coop/rose-ash/commit/34c9b211ac52e255f1f60ed7e2d90be39e43b5c8 [secondary project notes].
- PostgreSQL exclusion constraints with `tstzrange`/GiST: https://www.postgresql.org/docs/17/rangetypes.html [official; not fetched this session, standard feature].

### (c) Pitfalls
- Passing local `new Date(2026, 2, 31, 17)` to rrule → off-by-offset occurrences.
- Storing `starts_at` as `timestamp without time zone`.
- Regenerating by deleting all future occurrences → loses substitutions/attendance (spec TEST-007 exists; keep it).
- `UNTIL` in local time while DTSTART carries TZID (RFC requires UTC `UNTIL` when DTSTART is tz-aware) → extra/missing last session.
- iCal feed with participants' names or guardian e-mails leaking into parents' shared family calendars.
- Conflict checks done in app code without a DB exclusion constraint → two coaches book the same pitch under concurrency.

---

## Cross-cutting requirements derived for the spec (short list for the backlog)

1. Age gate: minors' accounts are enabled by the guardian; Poland = 16 for consent-based services; keep club setting, default to guardian-enable flow (Q-007).
2. Consent as versioned rows; image consent separate from participation.
3. Retention jobs: `people:retention-sweep`, `payments:retention-sweep` (6-year default), token purge, requester purge; anonymisation keeps accounting rows via `payer_ref.code`.
4. DPIA + processor register + breach register in `docs/compliance/`; Railway EU West Metal, Resend eu-west-1, Stripe Payments Europe DPA; document US log/metadata storage.
5. Money: integer grosz, half-up once, largest-remainder allocation, reversal-only corrections, sequenced KP/RG numbers under row lock, nightly invariant check, `gateway_events` dedupe table.
6. Bank import: per-bank CSV/MT940 profiles, encoding detection, `tx_hash` idempotency, tiered matching with recorded reasons, undo = reversal when downstream references exist.
7. Stripe: hosted Checkout, BLIK + P24 enabled (P24 needs legal info on the public page; MCC 7941 restricted), handle `async_payment_*`, raw-body signature check, 5-min tolerance, sandboxes per env.
8. Tenancy: MikroORM global strict filter + PostgreSQL RLS (restrictive policy, non-owner NOBYPASSRLS app role, FORCE RLS, `SET LOCAL`), org-first indexes, per-org envelope keys, per-tenant export script.
9. E-mail: subdomain, DKIM/SPF/DMARC (p=none → quarantine), eu-west-1, no tracking on transactional, one-click unsubscribe on announcements, bounce/complaint webhooks → person status, queue ≤ 8 req/s with idempotency keys.
10. Public pages: rate limits per IP/e-mail, honeypot + time-trap + e-mail verification, `'use cache'` + tags with `revalidateTag(tag,'max')`, robots/noindex on token pages, no cookie banner while no analytics (privacy policy still required).
11. A11y/perf: WCAG 2.2 AA (24 px targets, no drag-only, redundant entry, no cognitive auth), CWV p75 mobile budgets, Lighthouse CI, manifest-only PWA (SW only for offline attendance).
12. Ops: PITR + volume snapshots + off-site `pg_dump`, quarterly restore drills, Redis AOF + noeviction on a volume, sealed prod secrets, SLO 99.5 %, postmortem template, Renovate weekly.
13. OSS: MIT + NOTICE, DCO 1.1 via GitHub app, Contributor Covenant 3.0, SECURITY.md with private reporting, SemVer + Keep a Changelog, GOVERNANCE.md.
14. Calendar: expand in Europe/Warsaw, store timestamptz, idempotent upsert by (activity, date), GiST exclusion for facility bookings, iCal as expanded UTC VEVENTs with RECURRENCE-ID for exceptions.

---

## Appendix A — proposed schema/table additions (beyond the spec's Data Models)

| Table | Purpose | Key fields | Notes |
|---|---|---|---|
| `people_consents` | demonstrable consent (art. 7(1)) | `person_id`, `consent_type` enum (`publish_name`, `image`, `marketing`, `account_minor_enabled`), `given_by_person_id`, `given_at`, `withdrawn_at`, `text_version`, `source` | append-only; withdrawal = `withdrawn_at` set via command |
| `people_retention_log` | audit of anonymisation | `person_id`, `requested_by`, `reason` (`erasure_request`/`retention_sweep`), `tables_touched jsonb`, `kept_for_legal_basis text`, `performed_at` | required to answer a UODO query |
| `compliance_breach_register` | art. 33(5) register | `detected_at`, `summary` (no PII), `categories`, `approx_subjects`, `risk_level`, `notified_uodo_at`, `notified_subjects_at`, `postmortem_url` | even unreported incidents go here |
| `payments_gateway_events` | webhook dedupe | `event_id` unique, `event_type`, `object_id`, `received_at`, `processed_at`, `result` | insert-first; processing in queue |
| `payments_sequences` | gap-free numbering | `organization_id`, `series` (`KP`, `RG`), `year`, `last_value` | `SELECT ... FOR UPDATE` in the issuing command |
| `payments_audit` | immutable money audit | `actor_person_id`, `acting_role`, `command`, `entity_type`, `entity_id`, `version_before`, `version_after`, `payload_hash`, `occurred_at` | no UPDATE/DELETE grants for the app role |
| `payments_bank_profiles` | per-bank CSV/MT940 mapping | `organization_id`, `bank_name`, `format`, `encoding`, `delimiter`, `column_map jsonb`, `mt940_variant` | reused by subsequent imports |
| `communication_email_status` | deliverability state per address | `person_id`/`external_email`, `status` (`ok`/`soft_bounce`/`hard_bounce`/`complained`/`unsubscribed_announcements`), `last_event_at`, `provider_event_id` | drives suppression + UI badge |
| `auth_link_tokens` (generalised) | all personal links | `purpose`, `token_hash` unique, `person_id`, `scope jsonb`, `expires_at`, `consumed_at`, `created_ip_hash` | spec has per-module token tables; a shared shape eases purge/audit |
| `tenant_keys` | envelope encryption | `organization_id`, `key_version`, `wrapped_kek bytea`, `created_at`, `destroyed_at` | destroying = crypto-shred |

Exclusion constraint for facilities (PostgreSQL 17):

```sql
ALTER TABLE facilities_rentals
  ADD CONSTRAINT rentals_no_overlap EXCLUDE USING gist
  (organization_id WITH =, place_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status IN ('confirmed','pending_approval','internal'));
```

RLS skeleton (one restrictive policy per tenant table, app role `vereino_app` NOBYPASSRLS, tables owned by `vereino_owner` with FORCE):

```sql
ALTER TABLE payments_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments_charges FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payments_charges AS RESTRICTIVE
  USING (organization_id = current_setting('app.organization_id', true)::uuid);
-- per request/job: BEGIN; SET LOCAL app.organization_id = '...'; ...; COMMIT;
```

## Appendix B — verification backlog (claims not confirmed against primary text this session)

| # | Claim | Status | How to close |
|---|---|---|---|
| B1 | Poland did not lower the art. 8 age below 16 (ustawa z 10.05.2018 o ochronie danych osobowych) | secondary sources only (law-firm/blog, TRIS notification) | read Dz.U. 2018 poz. 1000 (consolidated) in ISAP; one-line legal opinion before pilot (spec Q-007) |
| B2 | UODO DPIA list (M.P. 2019 poz. 666) contains "osoby wymagające szczególnej opieki (dzieci)" and the "at least two criteria" rule | ISAP PDF behind CAPTCHA; summaries agree | download the annex from monitorpolski.gov.pl and quote it in the DPIA |
| B3 | art. 74 uor: 5 years for vouchers from the year after the FY; statements 5 years from the year after approval (since 2019) | consistent secondary sources incl. lexlege text dated 2026 | confirm with the club's accountant; also whether the club uses UEPiK |
| B4 | Polish bank CSV exports use cp1250/ISO-8859-2 | experience, not sourced | obtain real sample files from the club's bank during phase 4 step 1 |
| B5 | Open Mercato `gateway_stripe` forwards dynamic payment methods / BLIK and P24 | not checked (spec V-5) | verify module facts; Stripe side is confirmed |
| B6 | rrule.js current version and whether the tzid `after()` regression is fixed | npm returned 403; GitHub issues read | check npm/GitHub releases before pinning |
| B7 | Railway PITR retention/plan requirements | docs fetched (about 4 weeks); plan gating not stated | confirm on the project's plan in the Backups tab |
| B8 | Resend EU region stores message bodies in the EU | docs say account data/logs/metadata in US; body storage not stated | read resend.com/legal/subprocessors; ask support in writing |
| B9 | Railway subprocessor list / DPF certification details | DPA fetched; list not read | read trust.railway.com/item/subprocessors; attach to processor register |
| B10 | PKE cookie article numbers (398-400) | secondary | cite Dz.U. 2024 poz. 1221 in the privacy policy |
| B11 | Keep a Changelog 1.1.0 / SemVer text | not fetched (stable, well-known) | n/a |
| B12 | P24 MCC 7941 "restricted" means extra info at activation rather than refusal | Stripe docs say "may be supported, require additional information" | confirm with Stripe support when activating the club account |

## Appendix C — test cases to add to the acceptance set

- TEST-C01 Age gate: creating an own account for a 12-year-old is rejected; for 13-17 only via guardian-enable; audit row written with guardian id (setting-driven, see B1).
- TEST-C02 Consent: publishing an instructor's name without a `publish_name` consent row: public API omits it; withdrawal hides it within cache TTL.
- TEST-C03 Erasure: anonymise a guardian with paid charges: person row scrubbed, `payments_payments` intact, `payer_ref.code` still resolves to "anonymised payer", KP PDF regenerates without the name.
- TEST-C04 Retention sweep: a bank import older than `accounting_retention_years` loses its file and encrypted fields; booked payments remain.
- TEST-C05 Rounding: 100.00 PLN with 33 % sibling discount gives 67.00; 99.99 with 50 % gives 50.00 (half-up); split 100.00 over three charges 33.34/33.33/33.33 with largest-remainder; sum invariant asserted.
- TEST-C06 Sequencing: 50 concurrent `payments.cash.record` commands yield 50 distinct, gap-free KP numbers.
- TEST-C07 Import idempotency: importing the same MT940 twice creates zero new transactions; overlapping CSV with regenerated references creates none.
- TEST-C08 Matching: title "SKLADKA KUBA 03/2026 ABC123" with payer code `ABC123` and exact open amount is auto-booked; wrong amount is suggested with reason; undo after KP e-mail creates a reversing payment, not a delete.
- TEST-C09 Stripe: replayed `checkout.session.completed` (same event id) creates no second payment; `completed` with `payment_status=unpaid` leaves the charge open until `async_payment_succeeded`; tampered body returns 400 with no state change; event with timestamp older than 5 min is rejected.
- TEST-C10 Tenancy: as `vereino_app` with `app.organization_id` set to club A, a hand-written `SELECT` on club B's charges returns 0 rows; QueryBuilder without `applyFilters()` fails lint; a worker job without scope throws before any query.
- TEST-C11 Email: 200-recipient announcement runs at 8 req/s or less, every send carries a unique idempotency key, a retried batch sends no duplicates; a hard-bounce webhook flips the person's status and the next announcement skips them; one-click POST unsubscribes without login.
- TEST-C12 Links: consumed declaration token returns 410; expired returns 410; token for guardian A used on guardian B's ward returns 403; GET on the link does not change state (link-prefetch safe).
- TEST-C13 Public abuse: honeypot filled returns 202 and stores nothing; submission under 3 s returns 202 and stores nothing; 6th request from one IP in an hour returns 429 with `Retry-After`.
- TEST-C14 A11y: axe-core zero critical/serious on `/club`, attendance, charges, order form; every interactive target at least 24x24 CSS px; keyboard-only path through attendance save with the sticky bar not obscuring focus.
- TEST-C15 Perf: Lighthouse CI mobile (throttled) on `/club` and a token page: LCP 2.5 s or less, CLS 0.1 or less, TBT 200 ms or less, JS 150 kB gz or less.
- TEST-C16 DST: weekly Tuesday 17:00 activity generates 2026-03-24 16:00Z, 2026-03-31 15:00Z, 2026-10-20 15:00Z, 2026-10-27 16:00Z; an occurrence with attendance survives regeneration after a rule change.
- TEST-C17 Conflicts: two concurrent internal bookings for the same zone and overlapping range: exactly one succeeds (exclusion constraint), the other gets 409.
- TEST-C18 iCal: feed validates (no names of other participants), cancelled occurrence has `STATUS:CANCELLED`, moved occurrence has `RECURRENCE-ID` and incremented `SEQUENCE`.
- TEST-C19 Ops: restore drill script restores PITR to a sibling, invariant job passes, drill record written; Redis restart retains queued jobs; a deploy with a missing sealed variable fails the health check rather than booting.
