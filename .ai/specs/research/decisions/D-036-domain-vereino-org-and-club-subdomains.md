---
number: D-036
date: 2026-11-22
owner: Władek Kuć
source: the owner's choice of 2026-11-22 in a Claude Code session ("Tak, .org + .pl"), after a review of whether vereino.org is too long for club subdomains; availability checked by Claude in the RDAP registries and DNS the same day
status: confirmed (domain and address direction) / open (purchase, done by the owner)
---
# D-036 Domain vereino.org with clubs on subdomains; vereino.pl redirects

D12 put the domain on hold and listed .org, .com and .app. D34 puts many clubs on one shared instance, and every club needs an address of its own. The owner asked whether vereino.org is too long once clubs get addresses such as `gwiazda.vereino.org`, and chose:

1. **The main domain is `vereino.org`.** The product page and the documentation live at the root.
2. **`vereino.pl` redirects to `vereino.org`.** It serves the first market and catches people who type the Polish ending. `wereino.pl`, for people who write the name as they hear it, is an optional extra.
3. **Each club gets `{club}.vereino.org` by default.** The club's public page, the member pages and the panel live on it.
4. **A club may use its own domain instead.** Open Mercato's `customer_accounts:domain_mapping` maps a hostname such as `ksgwiazda.pl` to the club.
5. **The club part of the address is short and plain.** It uses lowercase a–z, digits and hyphens, without Polish letters, up to about 15 characters. The club chooses it. Names such as `www`, `app`, `api`, `mail`, `admin`, `docs` and `status` are reserved.
6. **E-mail is sent from a subdomain** of `vereino.org`, with SPF, DKIM and DMARC. The club's name goes in the sender name. This is the e-mail subdomain the engineering standards spec asks for (S12.1).

**Why the length is acceptable:** `vereino.org` has 11 characters. A club address has about 18–24, for example `gwiazda.vereino.org` (19) or `uks-gwiazda.vereino.org` (23). That is usual for hosted platforms with club subdomains. Parents and coaches rarely type the address: they open a link from a message, scan a QR code from a poster or start the app from the home screen. The length that matters is the club part, so it gets the limit in point 5.

**Why subdomains rather than paths (`vereino.org/gwiazda`):**

- each club is its own origin, so one club's cookies and sessions are not visible to another;
- switching a club to its own domain changes only the hostname;
- paths would need no wildcard certificate, but all clubs would share one origin.

**Why .org:** associations and an open-source project fit it, and it does not stop the paid hosted service. `vereino.com` (registered in 2012), `vereino.app` and `vereino.club` (registered in April 2026) are taken.

**Risks the owner accepts:**

- people may write the name as "wereino" when they hear it; the optional `wereino.pl` and sharing links instead of dictating them reduce this;
- a Polish parent may trust .pl more than .org; the `vereino.pl` redirect softens it.

**Availability on 2026-11-22**, from the RDAP registries and DNS, not a registrar quote:

| Domain | State |
|---|---|
| vereino.org | likely free (unknown to the registry, no DNS) |
| vereino.pl, vereino.eu | likely free (no DNS) |
| vereino.com | taken, registered 2012 |
| vereino.app | taken |
| vereino.club | taken, registered 2026-04 |

**Not decided here:**

| Topic | Where it is settled |
|---|---|
| Buying the domains | the owner buys them; the decision stands only once `vereino.org` is registered |
| Wildcard DNS and certificate for `*.vereino.org` on Railway, and club domains added by CNAME | E22-S01 (#627) |
| Session cookies set on the club's host, never on `.vereino.org` | E22-S01 (#627) |
| HSTS preload | engineering standards, after the domain is live |

**Applied in:**

- D-012: the open domain point is answered;
- E22-S01 (#627): the address scheme question gets this direction;
- product brief: a D36 row and the D12 row, added after PRs #635 and #651 merge, because those PRs change the same rows.

**To change:** a superseding record approved by the owner.
