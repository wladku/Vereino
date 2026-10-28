import { asFunction } from 'awilix'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { SCOPE_PROVIDER_TOKEN } from '@/modules/foundation'
import { createPeopleScopeService } from './services/scope-service'

/** `people.scopeService` (club spec DD-06): the record-scope provider, also registered as `vereino.scopeProvider`. */
export const PEOPLE_SCOPE_SERVICE = 'people.scopeService' as const

export function register(container: AppContainer) {
  // Registrars run for every request and job container, so the service closes over that container; the factory
  // takes no parameters, which keeps it independent of CLASSIC parameter-name injection.
  const scopeService = asFunction(() => createPeopleScopeService(container)).scoped()
  container.register({
    [PEOPLE_SCOPE_SERVICE]: scopeService,
    [SCOPE_PROVIDER_TOKEN]: asFunction(() => createPeopleScopeService(container)).scoped(),
  })
}
