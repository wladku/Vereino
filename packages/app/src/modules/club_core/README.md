# `club_core` — the club and its settings

Phase A1 of the foundation spec ([`.ai/specs/2026-10-27-vereino-foundation-primitives.md`](../../../../../.ai/specs/2026-10-27-vereino-foundation-primitives.md), Q17) adds only what issue #38 needs; issue #25 (E02-S01) extends the module with sections, places, institutions and the remaining settings of the club spec ([`.ai/specs/2026-10-20-vereino-club-management.md`](../../../../../.ai/specs/2026-10-20-vereino-club-management.md), *Data Models* → `club_core_club_settings`, DD-02, DD-37).

| Surface | Contents |
|---|---|
| Entity | `ClubSettings` / `club_core_club_settings`: `own_account_min_age` (16), `default_locale` (`pl`), `timezone` (`Europe/Warsaw`); one row per organization (unique `organization_id`), created by the first update |
| Pure logic | `lib/settings.ts`: Zod schema per setting, defaults, `resolveClubSettings` (invalid stored value → default + key in `invalidKeys`) |
| DI | `clubCoreSettings` (`services/settings.ts`): `get({ tenantId, organizationId }) → { values, defaultsApplied, updatedAt }`; reports `club_core.settings.invalid` |
| Command | `club_core.settings.update` (allowed grant: `club_admin`; undoable) |
| Route | `GET` / `PUT /api/club_core/settings` (`club_core.view` / `club_core.manage`) |
| Event | `club_core.settings.updated` (ids only) |
| ACL | `club_core.view`, `club_core.manage` (implies view) |

Club settings are organization-wide, not person-scoped records: the read is gated by the feature only; the write goes through `authorizeScoped` with the `club_admin` grant. Other modules read settings only through the `clubCoreSettings` DI service (foundation spec DD-F16), resolved with `hasRegistration` so they degrade to the defaults when `club_core` is absent.
