// Identity-link reads shared by the identity commands and routes (#566): the ids-only event payload, whether a user
// has a password, and a user's link list with the last-method rule. No `next/server`, cache or provider code, so the
// commands (loaded by the CLI too) stay light.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { User } from '@open-mercato/core/modules/auth/data/entities'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { IdentityLink } from '../data/entities'
import { IDENTITY_PROVIDERS, canRemoveMethod, type IdentityProvider } from '../lib/identity'

/** The ids-only payload of the `foundation.identity.*` events (S4.6). */
export function identityEventPayload(link: {
  id: string
  userId: string
  provider: IdentityProvider
  tenantId: string
  organizationId: string
}) {
  return {
    id: link.id,
    userId: link.userId,
    provider: link.provider,
    tenantId: link.tenantId,
    organizationId: link.organizationId,
  }
}

export type IdentityScope = { tenantId: string; organizationId: string }

export type IdentityLinkView = {
  id: string
  provider: IdentityProvider
  emailAtLink: string | null
  emailShared: boolean
  linkedAt: string
  lastSignedInAt: string | null
  updatedAt: string
}

export type IdentityList = {
  items: IdentityLinkView[]
  canUnlink: boolean
  providers: Array<{ id: IdentityProvider; enabled: boolean; linked: boolean }>
}

/** True when the user of `scope` has a password (a sign-in method besides the links). */
export async function userHasPassword(em: EntityManager, scope: IdentityScope, userId: string): Promise<boolean> {
  const user = await em.findOne(User, { id: userId, ...scope, deletedAt: null }, { fields: ['id', 'passwordHash'] })
  return typeof user?.passwordHash === 'string' && user.passwordHash.length > 0
}

/**
 * The user's links in `scope`, newest first, with the e-mail decrypted for display, whether one may be removed
 * (`canRemoveMethod`) and each provider's state. `enabled` comes from the caller (the provider registry).
 */
export async function listIdentities(
  container: AwilixContainer,
  scope: IdentityScope,
  userId: string,
  enabled: (provider: IdentityProvider) => boolean,
): Promise<IdentityList> {
  const em = container.resolve<EntityManager>('em').fork()
  const links = await findWithDecryption(
    em,
    IdentityLink,
    { userId, ...scope, deletedAt: null },
    { orderBy: { createdAt: 'desc' } },
    scope,
  )
  const hasPassword = await userHasPassword(em, scope, userId)
  const linked = new Set(links.map((link) => link.provider))
  return {
    items: links.map((link) => ({
      id: link.id,
      provider: link.provider,
      emailAtLink: link.emailAtLink ?? null,
      emailShared: Boolean(link.emailAtLink),
      linkedAt: link.createdAt.toISOString(),
      lastSignedInAt: link.lastSignedInAt ? link.lastSignedInAt.toISOString() : null,
      updatedAt: link.updatedAt.toISOString(),
    })),
    canUnlink: canRemoveMethod(hasPassword, links.length),
    providers: IDENTITY_PROVIDERS.map((id) => ({ id, enabled: enabled(id), linked: linked.has(id) })),
  }
}
