# Incident runbook

What the on-call maintainer does when an alert from [`monitoring.md`](monitoring.md) fires or a user reports a fault:
severity, first steps, rollback, restore, the personal-data breach path with the 72-hour deadline, and the service
level objectives of the pilot. Engineering standards S9.8, S14.6, S15.6, S15.7 and S15.9.

Keep the contacts (both maintainers' phone numbers, the club's data-protection contact, the Railway and vendor
logins) in the team password manager, never in this repository.

## Severity levels

| Level | Examples | Response | Who is told |
|---|---|---|---|
| **SEV1** | app unavailable; data lost or corrupted; a suspected personal-data breach; payments recorded wrongly for many members | start within 15 min, any hour; work until mitigated | both maintainers at once; the club contact within 1 h |
| **SEV2** | one major function broken (sign-in for a group, payments webhook failing, e-mails not sent); worker stopped; backup failed or missed | start within 2 h during the day, next morning at night | both maintainers; the club contact if members notice |
| **SEV3** | one user or one screen affected, a workaround exists; a fingerprint in the weekly digest | next working day; an issue in the tracker | the reporter |

A suspected breach is always SEV1 until the assessment below says otherwise. When in doubt, pick the higher level.

## First 15 minutes

1. **Acknowledge** the alert in the monitor, so the other maintainer knows someone is on it. The first to acknowledge
   is the incident lead until they hand it over in writing.
2. **Start the timeline**: a note (or an issue labelled `incident`, without personal data) with times in UTC — when it
   started, when it was noticed, every action and its result.
3. **Look**: `curl -s -w '%{http_code}\n' https://<host>/api/healthz`; the Railway project (which service is red, the
   last deployment and its time); `status.railway.com`; the worker and web logs with the filters of `monitoring.md`.
4. **Decide**: a deploy in the last hour and the fault started after it → **roll back** first, investigate later.
   Personal data may have been seen, changed, lost or sent to the wrong person → start the **breach path** in
   parallel; the clock runs from the moment you became aware.
5. **Tell**: SEV1 → the other maintainer now and the club contact within an hour (what is affected, what members
   should do, when the next update comes). No personal data in chat messages.

## Playbooks by alert

| Alert | Likely cause | Steps |
|---|---|---|
| Health check failing, `[healthz] Infrastructure probe failed component=database` | PostgreSQL down, restarting or out of disk/connections | Railway → PostgreSQL service: status, restarts, volume usage. Restart the service if it is stopped. Disk full → raise the volume size; never delete data files. Still failing after 15 min → restore path |
| Health check failing, `component=redis` | Redis down or out of memory | Restart Redis (queue state is recoverable, S15.8: jobs are idempotent and re-derived from PostgreSQL). Check `maxmemory-policy noeviction` and the volume |
| Health check failing, both probes fine in logs | web service crashed or a bad deploy | Railway deployment log; roll back (below) |
| Worker heartbeat missing | worker crashed, queue stuck, no club schedules, database down | Worker service logs: `"Dispatch sweep finished"` (last time), `"Job failed"`, crash loop. Restart the worker. No sweeps at all after a release → run the per-club setup of `deploy.md` |
| Backup failed (`vereino.ops.backup.failed`) or missed | bucket credentials, encryption key, network, disk | Read the line's `step` and `exitCode`; fix and run the backup job once by hand; confirm `vereino.ops.backup.succeeded`. Two nights without a backup is SEV1 (RPO broken) |
| Deploy failed or crashed (webhook) | build or start failure, missing variable | Railway keeps the previous deployment serving when a new one fails its health check; read the log, fix forward, or redeploy the previous one |
| Disk above 80 % | data growth, logs or dumps on the volume | Raise the volume before it fills; find the cause next working day |
| 5xx spike (digest) | a bug or a dependency | Group by `@path`; `"Application error reported"` lines give the `error.code` fingerprint; open an issue per fingerprint |

## Rollback

A rollback **redeploys the previous release** (S14.6): Railway → service → *Deployments* → the last good deployment →
*Redeploy*, for the web service and the worker service. Migrations are backward compatible for one release (S5.4), so
a rollback **never runs `down()`** and never touches the database. If a migration itself damaged data, rolling back
code does not help: take the restore path.

After rolling back, confirm `/api/healthz` answers 200, sign in once, and record the rolled-back version in the
timeline.

## Restore from backup

Use it only when data is lost or corrupted, never to fix an availability fault. Recovery rests on the nightly encrypted
off-site dump (ENG-Q-03: no PITR on Hobby), so **up to 24 hours of data can be lost**; the restore procedure, its
scripts and the drill record live with the backup job (E18-S03, #464). The outline (S15.7):

1. Put the app in maintenance so nothing is sent or charged while you restore: both kill switches of ADR-019 off
   (`VEREINO_EMAIL_SENDING_ENABLED`, `VEREINO_ONLINE_PAYMENTS_ENABLED`). They are specified but not built yet
   (checked 2026-11-20); until they are, stop the worker service (no job sends or charges anything) and ask the club to stop using the app
   until the switch in step 4.
2. Restore the chosen dump into a **sibling** PostgreSQL service (never over the damaged one — it is evidence and the
   fallback).
3. Verify it: row counts per table against the dump, sign in on a staging copy if time allows.
4. Switch the production database variable to the sibling service and redeploy web and worker.
5. Reconcile what happened between the restore point and the switch: re-fetch Stripe payments and refunds and replay
   them through the idempotent fulfilment; re-deliver provider webhooks from their dashboards; list the e-mails sent in
   that window from the provider log so affected users can be told.
6. Turn maintenance off; tell the club what was lost and what was reconciled.

Target: back in service within **60 minutes** of the decision to restore (RTO).

## Personal-data breach path (S9.8)

A breach is any security incident that leads to the accidental or unlawful destruction, loss, alteration, unauthorised
disclosure of, or access to personal data (GDPR Art. 4(12)): a leaked database dump or key, a member seeing another
member's data, an e-mail sent to the wrong guardian, a lost backup, ransomware, and also data that is **unavailable**
for long enough to harm someone.

**Who notifies.** The club is the controller of its members' data; the Vereino operator processes it for the club
(who signs the data processing agreement is still open, ENG-Q-03 — until it is settled, follow both columns).

| Step | Operator (processor) | Club (controller) |
|---|---|---|
| Tell the other side | the club's data-protection contact **without undue delay** after becoming aware (Art. 33(2)); aim for **within 24 h**, with what is known so far | — |
| Notify the supervisory authority | — (only for data where the operator is itself the controller, e.g. its own accounts) | **UODO within 72 hours** of becoming aware, unless the breach is unlikely to result in a risk to people's rights and freedoms (Art. 33(1)); later than 72 h only with the reasons for the delay. Information may be given in phases (Art. 33(4)). Use UODO's electronic notification form (linked from uodo.gov.pl) |
| Inform the people affected | supply the facts the club needs | **without undue delay** when the breach is likely to result in a **high risk** (Art. 34) |
| Record it | enter it in the breach register | enter it in its own register (Art. 33(5)) |

The operator helps the club meet its deadline: give it the content of Art. 33(3) as soon as known — the nature of the
breach, the categories and approximate number of people and records, the likely consequences, the measures taken or
proposed, and a contact point.

**The 72 hours count from awareness**, i.e. from the moment there is a reasonable degree of certainty that a breach
happened, not from when the investigation ends. Write that moment in the timeline.

**Informing the people affected (Art. 34) — criteria.** Assume **high risk**, and plan to inform them in clear
language (Polish, with a short version a child understands), when any of these hold:

- children's data are involved (most Vereino members are minors);
- financial data (payments, bank account numbers, transfer titles) or national ids (PESEL) are involved;
- the data allow identity theft, fraud, discrimination, or reveal where a child is at a given time (schedules,
  addresses, guardian contacts);
- the data reached an unknown or hostile party, or many people.

Informing them is **not** required when the data were unintelligible to the recipient (e.g. an encrypted dump whose
key was not compromised), when later measures removed the high risk, or when it would take disproportionate effort —
then a public communication of equal effect replaces it (Art. 34(3)).

**The breach register.** Every incident that touched personal data is entered — **notified or not** — with: an id, when
it happened and when it was noticed, what happened, the categories and approximate number of people and records, the
consequences, the measures taken, whether UODO and the people were notified (when, reference) or why not, and who
decided. The register lives in `docs/compliance/breach-register.md` (compliance pack, E19) and holds **no personal
data**: numbers and categories only, never names.

**Containment first**: revoke leaked keys and tokens, rotate secrets (`JWT_SECRET`, database password, bucket keys),
remove the exposure, and keep the evidence (logs are kept only 7 days on Hobby — export the relevant lines into the
incident note right away, without personal data).

## Service level objectives (pilot, S15.6)

| Objective | Target | Measured by |
|---|---|---|
| Availability of the app | 99.5 % over 30 days (error budget ≈ 3.6 h) | uptime monitor, `/api/healthz` check |
| Stripe webhook endpoint | 99.9 % over 30 days | Railway HTTP logs of `/api/payment_gateways/webhook/stripe` |
| E-mail sending | attempted within 5 min of its trigger | dispatch outbox; worker heartbeat |
| Alerting | both maintainers alerted within 5 min of an outage | ENG-TEST-08 |
| Restore time (RTO) | ≤ 60 min | restore drills (E18-S03) |
| Data loss (RPO) | ≤ 24 h (nightly dump, no PITR — ENG-Q-03) | restore drills |
| Support | best effort in Polish working hours; response within 1 working day | — |

When the 30-day error budget is spent, only fixes are deployed until a postmortem is written.

## After the incident

- SEV1 and SEV2 get a **blameless postmortem** within 5 working days: summary, impact (people, duration, data), the
  UTC timeline, root cause, what went well, what went badly, and action items each with an owner and a date. File the
  action items as tracker issues.
- Close the breach register entry with the final facts and decisions.
- If an alert came late, did not come, or woke someone for nothing, change `monitoring.md` in the same week.
