# Deployment checklist

The full deployment runbook (engineering standards S14.4) is planned for phase E4; until then this file collects the
steps a release needs after its migrations ran. Add a step here in the same pull request that makes it necessary.

## After deploying a release

### Per-club schedules

A module's `setup.ts` `seedDefaults` registers the scheduled jobs of a club when the club is set up. A club that
existed before the release that added a schedule, or that was created without `seedDefaults` (for example through the
API), has no such schedule until the module's idempotent club setup runs for it. Run it once per club after the
release; a second run registers nothing twice.

| Module | Command | Registers | Since |
|---|---|---|---|
| `activities` | `yarn mercato activities set-up-club --tenant <id> --org <id>` | occurrence generation, guardian confirmation expiry, declaration reminders, unassigned-session warnings | #192 |
| `payments` | `yarn mercato payments set-up-club --tenant <id> --org <id>` | charge generation (06:00), overdue reminders (09:00), checkout reconciliation and order-campaign closing (every 15 minutes) | #301, #405 |
| `facilities` | `yarn mercato facilities set-up-club --tenant <id> --org <id>` | rental lifecycle and request expiry (every 15 minutes), maintenance reminders (06:00) | #122, #125, #128, #221 |

The commands print what they registered; every entry under `schedules` must be `true`. A later change of the club's time zone
re-registers the time-zoned schedules on its own (`activities:reregister-schedule`, `payments:reregister-schedules`).
