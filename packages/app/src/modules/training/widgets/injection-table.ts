import type { ModuleInjectionTable } from '@open-mercato/shared/modules/widgets/injection'

/**
 * `training` injection table (training outlines spec DD-O07a, M-O6; #683): the session's outline on the spot
 * `vereino:club:occurrence:sections` that `activities` renders on `/club/occurrences/[id]` for the session's staff, so
 * `activities` never imports `training`.
 */
export const injectionTable: ModuleInjectionTable = {
  'vereino:club:occurrence:sections': [{ widgetId: 'training.injection.session-outline', priority: 100 }],
}

export default injectionTable
