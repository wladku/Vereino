// Registers the second-factor completion routes with the platform's MFA-pending gate (staff second factor spec V-2F02;
// #736). The registry is a module-scope map of the process, so `di.ts` calls this in every process and bundle that
// serves the API dispatcher; registering twice merges.
import { registerMfaPendingAccessRoutes } from '@open-mercato/shared/lib/auth/mfaPendingAccess'
import { SECOND_FACTOR_COMPLETION_ROUTES } from '../lib/second-factor'

export function registerSecondFactorRoutes(): void {
  registerMfaPendingAccessRoutes(SECOND_FACTOR_COMPLETION_ROUTES.map((route) => ({ ...route, methods: [...route.methods] })))
}
