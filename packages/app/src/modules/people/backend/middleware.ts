// Backend page middleware of `people` (`backend/middleware.ts`, run by the backend catch-all after the page's guards).
//
// `people.member-password-page` (#876, Q1, default applied 2026-11-27): a member who opens the panel's change-password
// page directly (an old bookmark, a link in a mail) is sent to the same form in the member app,
// `/club/profile/password`; staff with panel access (a `club_admin` or `treasurer` grant) and users linked to no person
// keep the panel page (`panelPasswordRedirect`). Any failure keeps the panel page: it still changes the password.
import type { AwilixContainer } from 'awilix'
import { CONTINUE_PAGE_MIDDLEWARE, type PageRouteMiddleware } from '@open-mercato/shared/modules/middleware/page'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { panelPasswordRedirectFor } from '../services/member-landing'

const logger = createLogger('people').child({ component: 'member-password-page' })

export const middleware: PageRouteMiddleware[] = [
  {
    id: 'people.member-password-page',
    mode: 'backend',
    target: '/backend/profile/change-password',
    priority: 50,
    async run(context) {
      const auth = context.auth
      if (!auth?.sub) return CONTINUE_PAGE_MIDDLEWARE
      try {
        const container = (await context.ensureContainer()) as unknown as AwilixContainer
        const location = await panelPasswordRedirectFor(container, auth)
        return location ? { action: 'redirect', location } : CONTINUE_PAGE_MIDDLEWARE
      } catch (error: unknown) {
        logger.warn('Member password redirect skipped; the panel page stays', { err: error })
        return CONTINUE_PAGE_MIDDLEWARE
      }
    },
  },
]

export default middleware
