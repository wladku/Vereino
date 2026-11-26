// Central place to enable modules and their source.
// - id: module id (plural snake_case; special cases: 'auth')
// - from: '@open-mercato/core' | '@app' | custom alias/path in future
import type { ModuleOverrides } from '@open-mercato/shared/modules/overrides'
import { parseBooleanWithDefault } from '@open-mercato/shared/lib/boolean'

export type ModuleEntry = { id: string; from?: '@open-mercato/core' | '@app' | string; overrides?: ModuleOverrides }

export const enabledModules: ModuleEntry[] = [
  { id: 'auth', from: '@open-mercato/core' },
  // `auth` setup (mercato init / auth setup) locks api_keys rows, so the entity must be registered.
  { id: 'api_keys', from: '@open-mercato/core' },
  { id: 'directory', from: '@open-mercato/core' },
  { id: 'configs', from: '@open-mercato/core' },
  { id: 'entities', from: '@open-mercato/core' },
  { id: 'query_index', from: '@open-mercato/core' },
  { id: 'api_docs', from: '@open-mercato/core' },
  { id: 'audit_logs', from: '@open-mercato/core' },
  { id: 'notifications', from: '@open-mercato/core' },
  { id: 'dashboards', from: '@open-mercato/core' },
  { id: 'events', from: '@open-mercato/events' },
  { id: 'search', from: '@open-mercato/search' },
  { id: 'attachments', from: '@open-mercato/core' },
]

// Vereino: the platform scheduler runs the module jobs registered through foundation's
// `registerModuleSchedule` (foundation spec phase A1; enabling approved by the product owner on 2026-10-27).
enabledModules.push({ id: 'scheduler', from: '@open-mercato/scheduler' })
// Vereino: the e-mail transport of foundation III `dispatch` (DD-M15; enabling approved by the product owner on
// 2026-11-01 for epic #23). `communication_channels` registers the only `sendEmail` transport and requires `progress`;
// the Resend provider requires `communication_channels` and `integrations`. `messages` stays disabled: the app
// initializes, builds and starts without it (checked for #71 — `communication_channels` only extends `messages:message`
// and references its entity in subscribers that never fire without it), so no `messages.*` feature exists to grant.
enabledModules.push(
  { id: 'progress', from: '@open-mercato/core' },
  { id: 'integrations', from: '@open-mercato/core' },
  { id: 'communication_channels', from: '@open-mercato/core' },
  { id: 'channel_resend', from: '@open-mercato/channel-resend' },
)
// Vereino: the club-editable dictionaries, first the PZPN age categories of `team` groups (club spec REQ-019, phase 2
// step 1; enabling approved by the product owner on 2026-11-04, D-030, for #92). `groups` requires it.
enabledModules.push({ id: 'dictionaries', from: '@open-mercato/core' })
// Vereino-owned modules (listed in vereino-modules.json).
enabledModules.push({ id: 'foundation', from: '@app' })
// The sidebar groups in the mockup's order (D-031 §1; navigation spec REQ-N01, V-N02, #494): the platform puts these
// group ids first, in this order, ahead of its own groups. Sidebar ordering is one app-wide decision, declared here only.
enabledModules.push({
  id: 'club_core',
  from: '@app',
  overrides: {
    nav: {
      groupOrder: [
        'club_core.nav.group',
        'people.nav.group',
        'groups.nav.group',
        'communication.nav.group',
        'payments.nav.group',
        'facilities.nav.group',
      ],
    },
  },
})
enabledModules.push({ id: 'people', from: '@app' })
// `groups` requires `people` and `club_core` (club spec phase 2 step 2, #30; enabling approved by the product owner).
enabledModules.push({ id: 'groups', from: '@app' })
// `activities` requires `groups`, `club_core` and `people` (club spec phase 2 steps 3 and 8, #31; enabling approved by
// the product owner).
enabledModules.push({ id: 'activities', from: '@app' })
// `communication` requires `people`, `groups` and `club_core` and reads `activities` optionally (foundation III phase B,
// #35; enabling approved by the product owner on 2026-11-01 for epic #23).
enabledModules.push({ id: 'communication', from: '@app' })
// Vereino: online payment of charges through the club's Stripe account (payments spec DD-42, phase 4 step 4, #110;
// enabling both modules with their migrations approved by the product owner on 2026-11-04, D-030, asked on #107).
// `payment_gateways` needs `integrations` (enabled above) for the provider credentials.
enabledModules.push(
  { id: 'payment_gateways', from: '@open-mercato/core' },
  { id: 'gateway_stripe', from: '@open-mercato/gateway-stripe' },
)
// `payments` requires `people`, `groups`, `activities` and `club_core` (payments spec phase 4 step 2, #108; phase 4
// approved by the product owner in D-030, 2026-11-04, without the treasurer role).
enabledModules.push({ id: 'payments', from: '@app' })
// `facilities` requires `activities`, `club_core` and `people` (facilities spec phase 5, #121; enabling and its
// migrations approved by the product owner on 2026-11-05 for epic #119).
enabledModules.push({ id: 'facilities', from: '@app' })
// `training` requires `club_core`, `people` and `groups` and reads `activities` through `activities.occurrenceFacts`
// (training outlines spec phase 2, DD-O05, #683; the module and its migrations approved by the product owner on
// 2026-11-24, Q-O09 on #671).
enabledModules.push({ id: 'training', from: '@app' })

// Vereino: the commercially licensed `@open-mercato/enterprise` package is not installed (ADR-023, ENG-Q-10, #466),
// so its modules (`record_locks`, `system_status_overlays`, `sso`, `security`, `agent_orchestrator`) and the scaffold
// example `agent_examples` are not registered. `yarn forbidden-packages:check` fails if it comes back.

// Vereino Enterprise (enterprise package spec DD-E03, D-035; #713): the modules of the private package
// `@vereino/enterprise` are registered only in a build with `NEXT_PUBLIC_VEREINO_ENTERPRISE=true`, which an overlay build
// sets after `scripts/enterprise-overlay.mjs` installed the package into `packages/enterprise`. The platform generator
// reads this file statically and evaluates only `process.env` reads and helpers it knows by name, such as
// `parseBooleanWithDefault` (lesson `modules-ts-is-parsed-statically`); the variable is `NEXT_PUBLIC_` because the
// browser evaluates this file again. Only the lines between the markers may name the package
// (`yarn forbidden-packages:check`); Enterprise entries carry no `overrides`.
// enterprise-switch:start
if (parseBooleanWithDefault(process.env.NEXT_PUBLIC_VEREINO_ENTERPRISE, false)) {
  enabledModules.push({ id: 'enterprise_demo', from: '@vereino/enterprise' })
}
// enterprise-switch:end
