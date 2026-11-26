# Edge proxy: an attack before a proxy exists, and setting one up

There is **no edge proxy** in front of `vereino.org` today. The owner decided to add one only when a trigger fires
(D-043, `.ai/specs/research/decisions/D-043-edge-proxy-on-a-trigger.md`; #739, epic #734). This runbook covers:

- [handling an attack](#a-an-attack-before-a-proxy-exists) with what exists today: the app's limits and Railway's
  edge tools;
- [setting up the proxy](#b-setting-up-the-edge-proxy) when a trigger fires;
- [bypassing the proxy](#c-bypassing-the-proxy-in-an-incident) in an incident, once it exists.

**Triggers (D-043):**

- an attack the app's limits (#751, [`deploy.md` → *Rate limits*](deploy.md#rate-limits)) cannot absorb, and Railway's
  edge tools do not stop it or must stay on for more than a day;
- the first club custom domain (D-036 point 4). Decide before it is connected, so club domains do not move twice.

Railway facts below come from its documentation, read on 2026-11-26. Check the linked page again before you act,
because Railway changes these features.

## A. An attack before a proxy exists

Follow [`incident.md`](incident.md) as for any incident: severity, the timeline, and telling the other maintainer. An
attack that makes the app unavailable is SEV1. Then go through these steps in order, and stop at the first one that
works:

1. **Confirm it is traffic, not a fault.**
   - In the app logs, look for many `Sessionless request over its rate limit` lines (component `sessionless-limits`).
   - In Railway's HTTP logs, group the requests by path and status: many requests on a few paths, or from a few
     addresses.
   - Check that the health check fails or the 5xx rate rises while the database and Redis probes stay healthy
     ([`incident.md` → *Playbooks*](incident.md#playbooks-by-alert)).
   - No attack, but a bad deploy? Roll back instead.
2. **The app's limits.** They act already. Check that `RATE_LIMIT_STRATEGY=redis` is set and that the boot log has no
   `RATE_LIMIT_TRUST_PROXY_DEPTH is unset or 0` warning. Without these, every client shares one counter, or the
   counters reset on every deploy ([`deploy.md` → *Rate limits*](deploy.md#rate-limits)). Adding app replicas helps
   only when the database is not the bottleneck ([`capacity.md`](capacity.md)).
3. **Railway edge rules** ([docs](https://docs.railway.com/networking/edge-rules)). In the app service, under
   **Settings → Edge**, add a rule:
   - **Block** a client address or CIDR range, or a path that is under attack. A rule can also **challenge** instead
     of block.
   - Rules match **IPv4 only**, and they apply to **every domain of the service**.
   - The documentation names no plan for rules; the rule editor shows your plan's limit.
   - Record each rule (what it matches, why, when) in the timeline. Remove it when the attack ends.
4. **Railway Under Attack Mode** ([docs](https://docs.railway.com/networking/waf)), for a limited time.
   - Turn it on in the app service's **Settings → Edge → Under Attack Mode** with a duration of 1 or 3 hours, or run
     `railway waf under-attack enable --service <app service> --duration 1h`. It takes effect in about 20 seconds.
     `railway waf under-attack status` and `disable` check and end it.
   - Every new browser visitor passes a browser check once.
   - **Other requests without a cleared browser are turned away:** the Stripe webhook
     (`/api/payment_gateways/webhook/stripe`), the uptime monitor's checks and any script.
     - Stripe retries undelivered webhooks, so payments arrive later. Check the webhook log in Stripe's dashboard after
       you turn the mode off.
     - Expect uptime alerts; note them in the timeline as caused by the mode.
     - The time counts against the webhook SLO in [`incident.md`](incident.md#service-level-objectives-pilot-s156).
   - Parents and coaches who open a link from an e-mail pass the check in their browser.
5. **The trigger fires** when the steps above do not stop the attack, or the mode must stay on for more than a day. Go
   to [B](#b-setting-up-the-edge-proxy). Until the proxy carries traffic, keep step 4 on in short periods, and tell the
   clubs what members may see (in Polish and English).
6. **Afterwards:** write the postmortem ([`incident.md` → *After the incident*](incident.md#after-the-incident)). Note
   which steps worked, how long each was on, and whether a limit of the app should change (an issue).

## B. Setting up the edge proxy

Do this only when a trigger of D-043 has fired. Do the steps in order. **No real traffic goes through the proxy before
step 2 is complete.**

### 1. Choose the vendor

The owner chooses. Record the choice and the reasons in a new decision record that supersedes the "not decided"
vendor row of D-043.

| Criterion | Why |
|---|---|
| A DPA under GDPR art. 28, signed before use, and a transfer mechanism for any processing outside the EEA | the proxy terminates TLS and sees personal data, children's data included |
| An EU data option: where TLS is terminated and inspected, and where logs are stored | keeps data in the EU where the vendor allows it |
| Proxying a one-level wildcard (`*.vereino.org`) and the bare domain, with a certificate for both | every club has its own subdomain (D-036) |
| Custom hostnames that Vereino does not own, with their certificates (with Cloudflare: "Cloudflare for SaaS") | club custom domains, the second trigger |
| Configurable WAF rules, managed rule sets with a log-only mode, and rate limits by path | the reason for the proxy |
| Layer-7 DDoS protection that is on by default | the reason for the proxy |
| A way to turn off proxying per record in seconds | the incident bypass ([C](#c-bypassing-the-proxy-in-an-incident)) |
| An outbound tunnel to the origin, or a published list of the vendor's addresses | the origin reachable only through the proxy (step 5) |
| Short log retention, which can be configured | the URLs of sessionless links carry tokens (step 7) |

### 2. Make it a sub-processor first

1. Sign the vendor's DPA and keep the signed copy where the other DPAs are kept.
2. Open a pull request that adds the vendor as the next free row of
   [`processors.md`](../compliance/processors.md) (P-6 at the time of D-043):
   - the data it sees: every request and response, cookies included, and the client address and URL in its logs;
   - its region and its EU data option;
   - the transfer mechanism and the DPA link;
   - the log retention.

   Remove the edge-proxy bullet from "Not recipients" in the same pull request.
3. Tell every club, as `processors.md` → *How to change this register* requires (GDPR art. 28(2)). Name the vendor,
   the reason and the date it starts. Under attack, the notice can be short, but it goes out before the switch.

### 3. DNS

1. Before moving the zone or its nameservers, **export every record** of `vereino.org` and `vereino.pl`. Lower their
   TTL to 300 seconds a day ahead when you can.
2. Proxy only the web records:
   - the bare domain;
   - `*` (the clubs);
   - the host of `APP_URL`.
3. Keep these records **DNS only** (not proxied):
   - Railway's `_acme-challenge` CNAME and its verification records: Railway says the wildcard does not verify
     without them ([docs](https://docs.railway.com/networking/domains/working-with-domains));
   - MX, SPF, DKIM and DMARC of the e-mail subdomain (D-036 point 6, S12.1).
4. Check: `dig +short <club slug>.vereino.org` returns the vendor's addresses, and `dig +short TXT` for the e-mail
   records returns the same values as before.

### 4. TLS

- **Edge certificate:** the vendor's certificate covers the bare domain and `*.vereino.org`. Set the minimum TLS
  version to 1.2. Keep the app's own `Strict-Transport-Security` header (checked by ENG-TEST-11).
- **Proxy to Railway:** Railway says a Cloudflare-proxied domain needs SSL/TLS mode **Full**, and that **Full (strict)
  does not work as intended**, because Railway answers the proxy with its `*.up.railway.app` certificate. **Never use
  Flexible**: it sends the hop to Railway unencrypted, and the app redirects to HTTPS, which loops.
- **Full encrypts the hop but does not check the certificate against the hostname.** Choose one before you switch,
  and record the choice:
  1. **The vendor's outbound tunnel** (for example Cloudflare Tunnel): a connector service in the Railway project
     dials out to the vendor. The app service then needs no public domain, which also closes the origin (step 5).
     Preferred, if the vendor and Railway support it at the time.
  2. **Full, with the origin closed by step 5.** Accepted only if the owner approves it in the decision record of
     step 1.
- Check Railway's domain documentation again. If Full (strict) is supported by then, use it.

### 5. Origin reachable only through the proxy

A proxy that can be bypassed protects nothing. Railway's public services have no firewall beyond edge rules, so:

- **With a tunnel (step 4.1):** remove the custom domains from the app service once traffic flows through the tunnel.
  Remove the generated `*.up.railway.app` domain too, if Railway allows it (the documentation does not say how).
- **Without a tunnel:**
  - add a Railway edge rule that **allows** the vendor's published address ranges, followed by a rule that
    **blocks** every other client address;
  - edge rules match IPv4 only, and a request without an IPv4 source matches no rule, so test from an IPv6 address
    that the origin refuses it;
  - when the vendor's ranges change, update the rule;
  - if the vendor can add a secret header to every request, also block requests without it. Test first how Railway
    treats a missing header: per its documentation, `is not` does not match a request without that header.
- **Check:** `curl -sI https://<app service>.up.railway.app/api/healthz` and `curl -sI --resolve <host>:443:<Railway
  address> https://<host>/` from a machine outside the vendor are refused (403, or no answer). The same URL through
  the proxy answers 200.

### 6. Client address and the app's limits

The proxy adds a hop, so the app must read the client's address one entry deeper:

1. Measure `RATE_LIMIT_TRUST_PROXY_DEPTH` again, exactly as in
   [`deploy.md` → *Rate limits*](deploy.md#rate-limits), steps 1–5, **through the proxy**.
2. Raise the depth only after step 5 is done. While the origin is reachable directly, a deeper depth lets a client
   choose its own address in `X-Forwarded-For` and escape its limit.
3. Prove it from two networks (step 5 of that section). Record the old and the new depth in the run log.

### 7. WAF, rate limits and caching

- **Managed rule set:** turn it on in **log-only** mode for a week, then review the matches and switch it to block.
  Add exceptions per path for false positives. Never turn the rule set off.
- **Rate limits at the edge** stop floods. They stay **looser than the app's limits**, because the app keeps the
  precise per-account and per-token limits of #738. Set them per client address on:
  - sign-in and password reset;
  - the sessionless routes (inventory: `docs/compliance/asvs-checklist.md` → *Sessionless route inventory*), public
    club pages `/p/*` included;
  - a general ceiling per address for the whole site.
- **Never challenge or block:**
  - `/api/payment_gateways/webhook/stripe` (the app verifies Stripe's signature);
  - `/api/healthz` from the uptime monitor;
  - the heartbeats ([`monitoring.md`](monitoring.md)).

  A browser check on API paths breaks the app's own calls; challenge page navigations only.
- **Caching:** cache nothing but the built static assets (`/_next/static/*`). HTML and every `/api/*` response bypass
  the cache. Authenticated responses already send `no-store` (ENG-TEST-11).
- **Do not let the proxy change pages.** Turn off script injection, e-mail obfuscation, automatic minification, its
  analytics and any "speed" rewriting. They break the Content Security Policy and change what members see.
- **Logs:** the URLs of declaration, order, request and rental links carry tokens in the path. Keep the vendor's log
  retention as short as it allows. Never export those logs into the repository or an issue.

### 8. Verify, then record

On staging first, then on production:

1. Run `node scripts/smoke.mjs <url>` with the smoke account through the proxy. Every check passes.
2. Check the headers (ENG-TEST-11 on staging): CSP, HSTS and `no-store` arrive unchanged.
3. Prove the limits from two networks (step 6).
4. Send a test webhook from Stripe's dashboard; the app answers 2xx.
5. Check the uptime monitor and both heartbeats are green.
6. Repeat the origin check of step 5: direct access is refused.
7. Open two clubs' addresses and a club custom domain, if one exists.

Write the run log (`.ai/runs/YYYY-MM-DD-edge-proxy-set-up.md`), with names only and no secrets. Then update in the same
pull request:

- [`deploy.md` → *Club addresses*](deploy.md#club-addresses) and *Rate limits*: how a club domain is connected through
  the proxy, and the new depth;
- [`monitoring.md`](monitoring.md): where the vendor's alerts go;
- section C below: the vendor's exact steps.

## C. Bypassing the proxy in an incident

Use this when the proxy itself fails: an outage at the vendor, a rule that blocks members, or a certificate error at
the edge. It sends traffic straight to Railway again and **removes the WAF and edge rate limits**. The app's limits
stay.

1. **Origin open again** (without it, the bypass leads to a refused origin):
   - **Tunnel:** add the custom domains back to the app service, with their verification records.
   - **Edge rules:** disable the rule that blocks every address outside the vendor's ranges, and the secret-header
     rule.
2. **DNS:** switch the proxied records to DNS only, pointing at the Railway targets that Railway shows for each
   domain. With a TTL of 300 seconds, traffic moves within minutes.
3. **Depth:** set `RATE_LIMIT_TRUST_PROXY_DEPTH` back to the value measured without the proxy, and redeploy.
4. **Check:** run `node scripts/smoke.mjs <url>` and `curl -s -w '%{http_code}\n' https://<host>/api/healthz`.
5. **Record** in the timeline when the bypass started and ended. Switch back in the reverse order: proxy the records,
   close the origin, then raise the depth.

A bypass during an attack leaves only section A's tools. Prefer fixing the rule that misbehaves.

## Related

- D-043 (this decision), D-036 (domain and club addresses), D-039 (Railway Pro).
- [`deploy.md` → *Rate limits*](deploy.md#rate-limits), [*Club addresses*](deploy.md#club-addresses) and
  [*Lock down production*](deploy.md#lock-down-production).
- [`incident.md`](incident.md), [`monitoring.md`](monitoring.md) and
  [`processors.md`](../compliance/processors.md).
