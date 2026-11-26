---
number: D-043
date: 2026-11-26
owner: Władek Kuć
source: the owner's decision of 2026-11-26 on issue #739 (E25-S05, epic #734), comment "Edge proxy on a trigger, not now", recorded at the owner's request in a decision session; Railway facts read by Claude from Railway's domain, edge-rule, WAF and CDN pages the same day
status: confirmed (direction) / open (vendor, chosen when a trigger fires)
---
# D-043 No edge proxy in front of vereino.org until a trigger fires

## Context

- `*.vereino.org` (D-036) runs on Railway Pro (D-039). Railway protects its network below layer 7. Epic #734 recorded
  no configurable WAF or rate limits at its edge. Railway's documentation now describes edge rules and Under Attack
  Mode (point 3), but still no rate limit and no managed WAF rule set.
- Every rate limit is therefore the application's: sign-in, password reset and every sessionless route, counted in
  Redis per client, per token and per account (#738, PR #751; `docs/ops/deploy.md` → *Rate limits*).
- An edge proxy with a WAF, rate limiting and layer-7 DDoS protection (for example Cloudflare) would add a layer in
  front of the app. But a proxy that terminates TLS **sees personal data in the traffic**, children's data included.
  It is then a **sub-processor**: it needs a DPA, an EU data option where the vendor offers one, a row in
  `docs/compliance/processors.md`, and the clubs must be told before it carries their data (GDPR art. 28(2)).
- Club custom domains (D-036 point 4) also bear on it. A proxy must cover hostnames that Vereino does not own, and
  Railway Pro allows 20 custom domains.

## Decision

1. **No edge proxy now.** `*.vereino.org` and the club domains point at Railway directly. No proxy account, DNS change
   or DPA is set up in advance.
2. **The edge proxy is set up when either trigger fires:**
   - **an attack the app-level limits cannot absorb**: the app's limits (#751) answer 429 and the app still degrades
     (the health check fails, or the 5xx rate or latency breaks the SLOs of `docs/ops/incident.md`), and Railway's own
     edge tools (point 3) do not stop it, or have to stay on for more than a day;
   - **the first club custom domain**: before a club's own domain is connected, the owner decides whether it goes
     behind the proxy from the start, so club domains are not moved twice.
3. **Until then, an attack is handled in this order:** the app's limits, then Railway's edge rules (block a client
   address, a range or a path), then Railway's Under Attack Mode for a limited time. Read on 2026-11-26, Railway's
   documentation describes edge rules (block, allow, challenge or redirect by client address, header or path; IPv4
   only) and Under Attack Mode (a browser check for every new visitor). Neither offers a rate limit. Under Attack Mode
   turns away API calls without a cleared browser, so while it is on, Stripe webhooks and uptime checks may fail. The
   steps are in `docs/ops/edge-proxy.md`.
4. **When a trigger fires, the runbook `docs/ops/edge-proxy.md` is followed:** choose the vendor, sign its DPA, add
   its row to `processors.md` and tell the clubs, **before** the proxy carries real traffic. Then come the DNS, the TLS
   mode, the origin reachable only through the proxy, the WAF and rate-limit rules, and the incident bypass.
5. **The app's limits stay** after a proxy exists. The proxy is an extra layer and never replaces them. The client
   address depth (`RATE_LIMIT_TRUST_PROXY_DEPTH`) is measured again behind it.

## Why

- At a few clubs, the app's limits (#751) and Railway's network protection cover the expected load and abuse. A proxy
  would add a sub-processor that sees all club traffic, children's data included, plus a DPA, a change to the
  processor register and a notice to the clubs, all for a risk that has not happened.
- The vendor depends on the trigger. Against an attack, layer-7 protection matters most. For custom domains, support
  for hostnames the customer does not own matters (with Cloudflare, "Cloudflare for SaaS").
- Railway's own edge tools give a first answer to an attack without a new processor, because the data stays with the
  host that already processes it (P-1).

## Risks the owner accepts

- An attack that the app's limits and Railway's edge tools do not stop causes downtime until the proxy is set up.
  Signing a DPA and telling the clubs takes time, so the first hours of such an attack are not covered.
- No managed WAF rule set (OWASP-style signatures) sits in front of the app. Input checks and ASVS level 2
  (`docs/compliance/asvs-checklist.md`) rest on the application.
- Railway's documentation, read on 2026-11-26, says a Cloudflare-proxied custom domain needs SSL/TLS mode **Full**:
  **Full (strict) does not work as intended**, because Cloudflare reaches Railway with the `*.up.railway.app`
  certificate. With Full, the hop from the proxy to Railway is encrypted, but the certificate is not checked against
  the hostname. Whether that is acceptable, or the vendor's tunnel is used instead, is decided when the proxy is set
  up (runbook step 4).

## Not decided here

| Topic | Where it is settled |
|---|---|
| The vendor (Cloudflare or another, preferably with an EU data option) | the owner, when a trigger fires, by the criteria of `docs/ops/edge-proxy.md` |
| Whether the proxy caches anything | at set-up; by default nothing is cached except the built static assets |
| Railway's plan limits for edge rules and Under Attack Mode | the owner checks them in the Railway dashboard; the documentation names no plan |
| Buying `vereino.org` | D-036 (the owner) |

## Applied in

- `docs/ops/edge-proxy.md`: the runbook for an attack before a proxy exists and for setting the proxy up.
- `docs/ops/deploy.md` (*Rate limits*) and `docs/ops/incident.md` (playbooks): links to the runbook.
- `docs/compliance/processors.md`: "Not recipients" records that there is no edge proxy and when it becomes a row.
- Product brief: row D43.

**Sources:** issue #739 and its owner comment of 2026-11-26;
[Railway domains](https://docs.railway.com/networking/domains/working-with-domains) (the Cloudflare and wildcard
sections), [Railway edge rules](https://docs.railway.com/networking/edge-rules),
[Railway WAF](https://docs.railway.com/networking/waf), [Railway CDN](https://docs.railway.com/networking/cdn).

**To change:** a superseding record approved by the owner.

**Revisit:** when either trigger fires, and after the first attack handled with Railway's edge tools.
