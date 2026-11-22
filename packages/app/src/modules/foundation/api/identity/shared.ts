// Shared pieces of the identity routes (#566): the provider parameter, the feature check of a session and the error
// body schema of the OpenAPI docs.
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { z } from 'zod'
import { IDENTITY_PROVIDERS } from '../../lib/identity'
import { trustedScopeOf } from '../../services/authorize-scoped'

export const providerParamsSchema = z.object({ provider: z.enum(IDENTITY_PROVIDERS) })

export const identityErrorSchema = z.object({ error: z.string(), code: z.string().optional() })

export const NO_STORE = { 'Cache-Control': 'no-store' } as const

/** True when the session's user holds every feature in the trusted organization. */
export async function sessionHasFeatures(ctx: CommandRuntimeContext, features: string[]): Promise<boolean> {
  const scope = trustedScopeOf(ctx)
  const userId = ctx.auth?.sub
  if (!scope || !userId) return false
  const rbac = ctx.container.resolve<RbacService>('rbacService')
  return rbac.userHasAllFeatures(userId, features, scope)
}

export const identityLinkViewSchema = z.object({
  id: z.uuid(),
  provider: z.enum(IDENTITY_PROVIDERS),
  emailAtLink: z.string().nullable().describe('The e-mail the provider reported when the link was made; null when none was shared'),
  emailShared: z.boolean(),
  linkedAt: z.string(),
  lastSignedInAt: z.string().nullable(),
  updatedAt: z.string().describe('Lock token for the unlink'),
})

export const identityListSchema = z.object({
  items: z.array(identityLinkViewSchema),
  canUnlink: z.boolean().describe('False while removing a link would leave the account without a sign-in method'),
  providers: z.array(z.object({ id: z.enum(IDENTITY_PROVIDERS), enabled: z.boolean(), linked: z.boolean() })),
})
