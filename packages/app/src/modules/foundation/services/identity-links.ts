// Identity-link reads shared by the identity commands and routes (#566): whether a user
// has a password, and a user's link list with the last-method rule. No `next/server`, cache or provider code, so the
// commands (loaded by the CLI too) stay light.
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { User } from '@open-mercato/core/modules/auth/data/entities'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { IdentityLink } from '../data/entities'
import { IDENTITY_PROVIDERS, canRemoveMethod, type IdentityProvider } from '../lib/identity'

export { identityEventPayload } from '../lib/identity'

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

/**
 * The user's sign-in methods inside the unlink transaction: the user row is locked `FOR UPDATE` first, so two
 * concurrent unlinks of the same user's links run one after the other and the second counts what the first left
 * (it never removes the last method). Locking the single user row cannot deadlock the way locking each link would.
 */
export async function lockedSignInMethods(
  em: EntityManager,
  scope: IdentityScope,
  userId: string,
): Promise<{ hasPassword: boolean; linkCount: number }> {
  const user = await em.findOne(
    User,
    { id: userId, ...scope, deletedAt: null },
    { fields: ['id', 'passwordHash'], lockMode: LockMode.PESSIMISTIC_WRITE },
  )
  const linkCount = await em.count(IdentityLink, { ...scope, userId, deletedAt: null })
  return { hasPassword: typeof user?.passwordHash === 'string' && user.passwordHash.length > 0, linkCount }
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

/** How many links of `provider` the user has in `scope` (the `link` route's 409 pre-check). */
export async function ownLinkCount(
  container: AwilixContainer,
  scope: IdentityScope,
  userId: string,
  provider: IdentityProvider,
): Promise<number> {
  const em = container.resolve<EntityManager>('em').fork()
  return em.count(IdentityLink, { ...scope, userId, provider, deletedAt: null })
}

/** The user a link of `scope` belongs to, or null (the unlink route's feature gate). */
export async function linkOwner(container: AwilixContainer, scope: IdentityScope, id: string): Promise<string | null> {
  const em = container.resolve<EntityManager>('em').fork()
  const link = await em.findOne(IdentityLink, { id, ...scope, deletedAt: null }, { fields: ['id', 'userId'] })
  return link?.userId ?? null
}

/** Deletes every link of a deleted user in `scope` (the `auth.user.deleted` subscriber); a repeat deletes nothing. */
export async function deleteUserLinks(
  container: AwilixContainer,
  scope: IdentityScope,
  userId: string,
): Promise<number> {
  const em = container.resolve<EntityManager>('em').fork()
  return em.nativeDelete(IdentityLink, { userId, ...scope })
}
