---
number: D-027
date: 2026-10-27
owner: Władek Kuć
source: om-spec-writing session 2026-10-27 — Władek's answers to the second gate of the foundation spec (Q8–Q11) and to the review questions Q13/Q14 (`.ai/runs/2026-10-27-foundation-spec.md`)
status: confirmed
---
# D-027 Sign-in with Google and Facebook for account holders

1. **Scope.** Social sign-in joins 1.0 as **Should**, for people who already hold an invited Vereino account (guardians, adult participants, staff; wards aged 16–17 with their limited account). It is designed in `.ai/specs/2026-10-27-vereino-social-sign-in.md` and recorded in the club management spec as REQ-040.
2. **Mechanism.** A Vereino slice inside the `foundation` module built on the `arctic` OAuth/OIDC client (dependency approval still owed under S16.1), with the platform's own session issuance. The commercial `@open-mercato/enterprise` `sso` module stays disabled (lesson `enterprise-package-is-commercial`); no external identity provider.
3. **Providers and order.** Google first, Facebook second (Facebook needs App Review, a published privacy policy and a data-deletion callback).
4. **Linking rule.** A provider identity is linked only from a signed-in session (`/club/profile`) or by the administrator. A social sign-in succeeds only for an already linked identity. No account is created from a social sign-in and no e-mail is matched at sign-in (R01 stays: one person, at most one account; the invitation stays the only way an account comes into being).
5. **DD-35 extension.** The sign-in lookup on `vereino_identity_links` (`provider`, `subject`) is a second read-only, index-backed system-scope read next to the public slug and token-hash lookups of D-024/D-026: it returns at most one row and immediately narrows every further query to the linked user's tenant and organization. The club spec's DD-35 and `AGENTS.md` list it.

**Consequences in the specs:**
- Product brief: Decisions row D27; the 1.0 scope names social sign-in as Should.
- Club management spec: REQ-040, AC-040, TEST-056 (a pointer to the social sign-in spec's tests), the traceability row, DD-35 extended, the events row `people.role_assignment.*` corrected to `auth.users.update` (the platform's `rbacService` has no grant API — foundation spec DD-F05).
- `AGENTS.md`: the system-scope exception names the identity lookup.

**To change:** a superseding record approved by the owner.

**Revisit:** at the phase 2 pilot review — the share of account holders who connected a provider (the social spec's primary outcome).
