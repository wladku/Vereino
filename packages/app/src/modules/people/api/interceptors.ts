// API interceptors of `people` (UMES; `.ai/guides/extensions.md` → API Interceptors).
//
// `people.member-landing` (club spec *UI architecture* → redirect after sign-in; #27): after a successful
// `POST /api/auth/login` whose answer is the platform default `/backend`, a user linked to a person of their
// organization who holds `people.self` lands on `/club`; a user linked to no person stays on `/backend` with a notice
// ("not linked to a person — contact the club") and never reaches anyone's data. An explicit `redirect` is kept. The
// interceptor only rewrites the `redirect` key and never blocks a sign-in: any failure keeps the platform's answer.
import type { ApiInterceptor } from '@open-mercato/shared/lib/crud/api-interceptor'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { memberLandingRedirect } from '../services/member-landing'

const logger = createLogger('people').child({ component: 'member-landing' })

const memberLandingInterceptor: ApiInterceptor = {
  id: 'people.member-landing',
  targetRoute: 'auth/login',
  methods: ['POST'],
  timeoutMs: 5_000,
  async after(_request, response, context) {
    if (response.statusCode !== 200) return {}
    try {
      const redirect = await memberLandingRedirect(context.em, context.container, response.body)
      return redirect ? { merge: { redirect } } : {}
    } catch (error: unknown) {
      logger.warn('Member landing skipped; the sign-in keeps the platform redirect', { err: error })
      return {}
    }
  },
}

export const interceptors: ApiInterceptor[] = [memberLandingInterceptor]

export default interceptors
