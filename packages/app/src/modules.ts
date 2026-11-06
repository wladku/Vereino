// Central place to enable modules and their source.
// - id: module id (plural snake_case; special cases: 'auth')
// - from: '@open-mercato/core' | '@app' | custom alias/path in future
import { parseBooleanWithDefault } from '@open-mercato/shared/lib/boolean'

export type ModuleEntry = { id: string; from?: '@open-mercato/core' | '@app' | string }

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
enabledModules.push({ id: 'club_core', from: '@app' })
enabledModules.push({ id: 'people', from: '@app' })
// `groups` requires `people` and `club_core` (club spec phase 2 step 2, #30; enabling approved by the product owner).
enabledModules.push({ id: 'groups', from: '@app' })
// `activities` requires `groups`, `club_core` and `people` (club spec phase 2 steps 3 and 8, #31; enabling approved by
// the product owner).
enabledModules.push({ id: 'activities', from: '@app' })
// `communication` requires `people`, `groups` and `club_core` and reads `activities` optionally (foundation III phase B,
// #35; enabling approved by the product owner on 2026-11-01 for epic #23).
enabledModules.push({ id: 'communication', from: '@app' })
// `payments` requires `people`, `groups`, `activities` and `club_core` (payments spec phase 4 step 2, #108; phase 4
// approved by the product owner in D-030, 2026-11-04, without the treasurer role).
enabledModules.push({ id: 'payments', from: '@app' })

const enterpriseModulesEnabled = parseBooleanWithDefault(process.env.OM_ENABLE_ENTERPRISE_MODULES, false)
const enterpriseSsoEnabled = parseBooleanWithDefault(process.env.OM_ENABLE_ENTERPRISE_MODULES_SSO, false)
const enterpriseSecurityEnabled = parseBooleanWithDefault(process.env.OM_ENABLE_ENTERPRISE_MODULES_SECURITY, false)
const enterpriseAgentsEnabled = parseBooleanWithDefault(process.env.OM_ENABLE_ENTERPRISE_MODULES_AGENTS, false)

if (enterpriseModulesEnabled) {
  enabledModules.push(
    { id: 'record_locks', from: '@open-mercato/enterprise' },
    { id: 'system_status_overlays', from: '@open-mercato/enterprise' },
  )
}

if (enterpriseModulesEnabled && enterpriseSsoEnabled) {
  enabledModules.push({ id: 'sso', from: '@open-mercato/enterprise' })
}

if (enterpriseModulesEnabled && enterpriseSecurityEnabled) {
  enabledModules.push({ id: 'security', from: '@open-mercato/enterprise' })
}

if (enterpriseModulesEnabled && enterpriseAgentsEnabled) {
  enabledModules.push({ id: 'agent_orchestrator', from: '@open-mercato/enterprise' })
  // Example app module: shows how to declare an Agent Orchestrator agent from a
  // brand-new module. Its source ships in every preset; it imports the
  // orchestrator SDK, so it is only enabled alongside it.
  enabledModules.push({ id: 'agent_examples', from: '@app' })
}
