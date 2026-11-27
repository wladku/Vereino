import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

// The club administrator and the platform admin see the demo page; the licence still has to switch it on.
export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    superadmin: ['enterprise_demo.*'],
    admin: ['enterprise_demo.*'],
  },
}

export default setup
