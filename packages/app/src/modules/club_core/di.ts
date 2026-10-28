import { asFunction } from 'awilix'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { createClubCoreSettingsService } from './services/settings'

/** DI token of the club settings service (foundation spec DD-F16): `get({ tenantId, organizationId })`. */
export const CLUB_CORE_SETTINGS_SERVICE = 'clubCoreSettings' as const

export function register(container: AppContainer) {
  container.register({
    // `.proxy()` resolves `em` by property name, which survives bundler renaming under CLASSIC injection.
    [CLUB_CORE_SETTINGS_SERVICE]: asFunction((cradle: { em: EntityManager }) =>
      createClubCoreSettingsService(() => cradle.em),
    )
      .scoped()
      .proxy(),
  })
}
