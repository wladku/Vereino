# E-mail: the sending subdomain, SPF, DKIM and DMARC

Club e-mail (invitations, declaration links, reminders, notices) goes out through Resend from the sending subdomain
**`mail.vereino.org`**, never from the bare `vereino.org` or a club's own domain (D-036 point 6, engineering standards
S12.1; E28-S01, #821). Receivers deliver it only when SPF, DKIM and DMARC pass and are aligned with that subdomain.
This runbook lists the owner's steps at the provider and the DNS host, the app variables, the check command, the
staging header check, the move to `p=quarantine` and the `vereino.pl` redirect.

Owner decisions (#821, 2026-11-26): the sending subdomain is `mail.vereino.org` (the club label `mail` is reserved, D-036
point 5); DMARC reports go to a separate alias such as `dmarc-reports` at `vereino.org`, never a private mailbox; the
`vereino.pl` redirect is set at the registrar in the same pass. A club's own domain (E05, #24) and changing the provider
are out of scope.

Provider facts below come from Resend's domain page as of 2026-11-26. The page shows the exact values for the domain;
copy them from there, and check this runbook against the page again if the two differ.

## 1. Add the domain at the provider (owner)

1. In Resend, **Domains → Add domain**: `mail.vereino.org`, region **`eu-west-1` (Ireland)**, so mail is sent from the
   EU (S12.1, ADR-011).
2. Keep the custom Return-Path label **`send`** (Resend's default). The check command assumes it; pass
   `--return-path <label>` if you choose another one.
3. In the domain's **Configuration**, turn **off open tracking and click tracking**. Tracking adds a pixel and rewrites
   every link through the provider, which breaks the declaration and order links and tells the provider who opened what.
   Club e-mail carries neither.
4. Create the API key with **Sending access** for this domain only, and put it into the environment as a sealed
   variable (`RESEND_API_KEY`, [`deploy.md`](deploy.md) L-3). Never put the key into a file or a run log.

## 2. DNS records (owner, at the DNS host of `vereino.org`)

| Purpose | Type | Name | Value |
|---|---|---|---|
| DKIM | TXT | `resend._domainkey.mail` | `p=MIGf…` — the public key Resend shows, in full |
| SPF on the custom Return-Path | TXT | `send.mail` | `v=spf1 include:amazonses.com ~all` |
| Bounces to the Return-Path | MX | `send.mail` | `feedback-smtp.eu-west-1.amazonses.com`, priority `10` |
| DMARC | TXT | `_dmarc.mail` | `v=DMARC1; p=none; rua=mailto:<report alias>; adkim=r; aspf=r` |

- Names are relative to `vereino.org` (`send.mail` is `send.mail.vereino.org`). Some DNS hosts want the full name.
- The SPF record lives on the Return-Path host, not on `mail.vereino.org` itself: the provider sends with
  `send.mail.vereino.org` as the envelope sender, and SPF aligns with `mail.vereino.org` under relaxed alignment.
- Keep exactly one `v=spf1` record per name and one `v=DMARC1` record per name; two of either make the check fail and
  receivers ignore both.
- `<report alias>` is the separate alias (for example `dmarc-reports` at `vereino.org`) that forwards to the maintainers.
  When the alias is on a domain other than `vereino.org`, that domain must publish the RFC 7489 authorisation record
  `vereino.org._report._dmarc.<that domain>` (TXT `v=DMARC1`).
- Without a `_dmarc.mail` record receivers fall back to `_dmarc.vereino.org`. Give the subdomain its own record anyway:
  its policy then moves on its own schedule (section 6).
- In Resend, press **Verify DNS records** and wait until the domain shows *Verified*.

## 3. App variables (owner, per environment)

| Variable | Value |
|---|---|
| `SYSTEM_EMAIL_PROVIDER` | `resend` |
| `RESEND_API_KEY` | the key from step 1.4, sealed |
| `NOTIFICATIONS_EMAIL_FROM` | `Vereino <noreply@mail.vereino.org>` — an address on the sending subdomain |
| `EMAIL_FROM` | the same address |

- The app picks `NOTIFICATIONS_EMAIL_FROM`, then `EMAIL_FROM`, then `ADMIN_EMAIL` ([`packages/app/.env.example`](../../packages/app/.env.example)).
  Every one that is set must be on `mail.vereino.org`, or the provider refuses the message or DMARC fails.
- With a club domain set, the sender's display name becomes "<club> via Vereino" in front of this address
  ([`deploy.md` → *Club addresses*](deploy.md); many clubs spec REQ-M03). The address itself never changes per club.
- Staging uses the same subdomain and its own API key, or a second sending subdomain checked the same way.

## 4. Check the records

```bash
yarn ops:mail-dns mail.vereino.org --from "Vereino <noreply@mail.vereino.org>"
```

Without `--from` the command checks `NOTIFICATIONS_EMAIL_FROM` and `EMAIL_FROM` of the current environment. It reads
public DNS only, no secret, and checks:

- **DKIM:** a TXT record with a public key at `resend._domainkey.<subdomain>` (`--dkim-selector` for another selector);
- **SPF:** exactly one `v=spf1` record at `send.<subdomain>` that includes `amazonses.com` and ends in `~all` or `-all`;
- **Return-Path MX:** `send.<subdomain>` points at `feedback-smtp.eu-west-1.amazonses.com` (`--region` for another);
- **DMARC:** exactly one `v=DMARC1` record at `_dmarc.<subdomain>`, else at `_dmarc.vereino.org`, with a valid `p=` and
  a `rua=mailto:` report address; `--policy quarantine` also requires that policy (section 6);
- **From:** every from-address is on the subdomain itself.

Exit 0: everything is right. Exit 1: each problem is printed on its own line. Exit 2: a usage error or a DNS lookup
that failed (network, timeout); run it again. DNS changes can take up to the record's TTL to show up.

## 5. Staging header check (owner or a maintainer, once per setup change)

1. On staging, send an invitation to a Gmail test inbox and to an Outlook test inbox.
2. Open the original message (Gmail: *Show original*; Outlook: *View → Message details*) and check:
   - `Authentication-Results` shows `spf=pass`, `dkim=pass` with `header.d=mail.vereino.org` (aligned) and
     `dmarc=pass`;
   - the sender name is "<club> via Vereino" and the address is on `mail.vereino.org`;
   - no tracking pixel (no 1×1 image from the provider) and no link rewritten through a provider click domain: every
     link points at the club address or `APP_URL`.
3. Record the result in a run log under `.ai/runs/` (`YYYY-MM-DD-mail-dns-staging.md`): date, inbox provider, the three
   results, the sender name, tracking found or not. **No e-mail addresses**: write "Gmail test inbox", not the address.

## 6. Moving DMARC to `p=quarantine` (owner, after two clean weeks)

1. Read the aggregate reports that reach the report alias for two weeks after `p=none` went live.
2. Clean means: every source that sends as `mail.vereino.org` is the provider, and its messages pass DKIM and SPF
   aligned. An unknown source sending as the subdomain is either spoofing (good to block) or a sender you forgot (fix
   it first).
3. Change the `_dmarc.mail` record to `v=DMARC1; p=quarantine; rua=mailto:<report alias>; adkim=r; aspf=r`.
4. Run `yarn ops:mail-dns mail.vereino.org --policy quarantine`; it must exit 0.
5. Record the date in the table below (in a docs PR) and in the run log.

| Policy | Since | Recorded by |
|---|---|---|
| `p=none` | not yet set | — |
| `p=quarantine` | not yet set | — |

## 7. `vereino.pl` redirects to `vereino.org` (owner, at the registrar)

1. At the registrar of `vereino.pl`, set a permanent (301) redirect of `vereino.pl` and `www.vereino.pl` to
   `https://vereino.org`, keeping the path (D-036).
2. Check:

   ```bash
   curl -sI http://vereino.pl/x | grep -iE '^(HTTP|location)'
   curl -sI https://vereino.pl/x | grep -iE '^(HTTP|location)'
   ```

   Both answer `301` with `location: https://vereino.org/x`.
3. `vereino.pl` sends no mail. Publish `v=spf1 -all` (TXT on `vereino.pl`) and `v=DMARC1; p=reject` (TXT on
   `_dmarc.vereino.pl`) so nobody can send as it.

## Rollback

- A wrong DNS record: fix the record; nothing in the app changes.
- Mail stops arriving after a change: set the DMARC policy back to `p=none` and re-run the check. Never turn tracking
  on to debug delivery; use the provider's delivery log.
- Sending must stop at once: `VEREINO_EMAIL_SENDING_ENABLED=false` ([`deploy.md`](deploy.md) → kill switches).
