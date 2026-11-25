import type { ModuleInjectionTable } from '@open-mercato/shared/modules/widgets/injection'

/**
 * `foundation` injection table (social sign-in, #566): the provider buttons and the generic sentence on the platform
 * login form (`auth.login:form`), "Connected accounts" on `people`'s `/club/profile` (`vereino:club:profile:sign-in`)
 * and "Sign-in methods" on the person record's Account tab (`vereino:people:person-record:sign-in`) — so `people`
 * never imports `foundation`'s identity code.
 */
export const injectionTable: ModuleInjectionTable = {
  'auth.login:form': [{ widgetId: 'foundation.injection.login-identity', priority: 100 }],
  'vereino:club:profile:sign-in': [{ widgetId: 'foundation.injection.profile-identities', priority: 100 }],
  'vereino:people:person-record:sign-in': [{ widgetId: 'foundation.injection.person-identities', priority: 100 }],
}

export default injectionTable
