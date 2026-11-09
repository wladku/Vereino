// P-10 TokenLinkService (foundation spec REQ-F07, phase C; DD-35, D-024, D-026): personal links that work without a
// session. A consuming module declares its own table (`ScopedEntityBase` + `tokenLinkColumns` from `@vereino/db` +
// its subject and target columns) and builds one service for it in its `di.ts`:
//   `createTokenLinkService(DeclarationToken, { use: 'until_expiry', ttlMs })`.
// `issue` stores only the platform's `hashAuthToken` of the raw token; `peek` is the single read-only system-scope
// lookup of the hash that a GET route may run (it spends nothing, so a mail scanner opening the link is harmless) and
// narrows at once to the found tenant and organization; `redeem` runs in the consuming command's transaction and
// spends the link with a conditional UPDATE whose affected-row count decides — the compare-and-set the platform's
// `authService` uses for password-reset tokens. Grants are never stored: `authorizeScoped` recomputes the subject's
// current grants at redemption. Nothing here logs or emits the raw token or its hash.
import { raw, type EntityData, type EntityName, type FilterQuery } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { generateAuthToken, hashAuthToken } from '@open-mercato/core/modules/auth/lib/tokenHash'
import type { TokenLinkFields, TokenLinkUse } from '@vereino/db'
import { foundationErrors } from '../api/errors'
import { expiryFor, hashesMatch, isWellFormedToken, tokenLinkState, type TokenLinkState } from '../lib/token-link'

/** The trusted tenant and organization a link is issued in, or the only ones a route accepts it from. */
export type TokenLinkScope = { tenantId: string; organizationId: string }

/** A token-link row: the scoped base columns plus the columns of its use policy. */
export type TokenLinkEntity<TUse extends TokenLinkUse> = {
  id: string
  tenantId: string
  organizationId: string
  updatedAt: Date
  deletedAt?: Date | null
} & TokenLinkFields<TUse>

type ManagedColumns =
  | 'id'
  | 'tenantId'
  | 'organizationId'
  | 'createdAt'
  | 'updatedAt'
  | 'deletedAt'
  | 'tokenHash'
  | 'expiresAt'
  | 'usedAt'
  | 'usedCount'
  | 'lastUsedAt'

/** The consumer's own columns of a new link: the subject (e.g. the guardian person id) and the targets. */
export type TokenLinkSubject<TEntity> = Omit<EntityData<TEntity>, ManagedColumns>

export type TokenLinkServiceOptions<TUse extends TokenLinkUse> = {
  use: TUse
  /** Time to live of a new link in milliseconds, unless `issue` names an earlier `expiresAt`. */
  ttlMs: number
}

export type IssueOptions = {
  /** An expiry of its own (e.g. the start of the occurrence); must lie in the future and within the time to live. */
  expiresAt?: Date
}

export type IssuedTokenLink<TEntity> = {
  /** The raw token for the e-mail; it is not stored anywhere and must not be logged or put in an event or a job. */
  rawToken: string
  link: TEntity
}

export type LookupOptions = {
  /** The tenant and organization the route serves; a link of another one answers like an unknown token. */
  scope?: TokenLinkScope
}

/** An active link and the tenant and organization every further query of the request must use. */
export type TokenLinkView<TEntity> = { link: TEntity; tenantId: string; organizationId: string }

export type TokenLinkService<TEntity> = {
  issue(
    em: EntityManager,
    subject: TokenLinkSubject<TEntity>,
    scope: TokenLinkScope,
    options?: IssueOptions,
  ): Promise<IssuedTokenLink<TEntity>>
  /** `null` for an unknown token (the route answers 404 with the expired copy); 410 for an expired or used link. */
  peek(em: EntityManager, rawToken: unknown, options?: LookupOptions): Promise<TokenLinkView<TEntity> | null>
  /**
   * As `peek`, but an expired or used link answers its state instead of 410, so a page can point the holder to where a
   * new link is requested (#192). The same single lookup; spends nothing. The caller must still refuse a non-`active`
   * link's data — only the target ids may be used.
   */
  inspect(
    em: EntityManager,
    rawToken: unknown,
    options?: LookupOptions,
  ): Promise<{ state: TokenLinkState; view: TokenLinkView<TEntity> } | null>
  /** As `peek`, then spends the link in `em`'s transaction; a lost race answers 410 `token_link_used`. */
  redeem(em: EntityManager, rawToken: unknown, options?: LookupOptions): Promise<TokenLinkView<TEntity> | null>
}

export function createTokenLinkService<TUse extends TokenLinkUse, TEntity extends TokenLinkEntity<TUse>>(
  Entity: EntityName<TEntity>,
  options: TokenLinkServiceOptions<TUse>,
): TokenLinkService<TEntity> {
  const { use, ttlMs } = options
  expiryFor(new Date(), ttlMs)

  /** The DD-35 lookup: by the unique hash only (system scope), then compared in constant time and narrowed. */
  async function find(em: EntityManager, rawToken: unknown, lookup: LookupOptions): Promise<TEntity | null> {
    if (!isWellFormedToken(rawToken)) return null
    const tokenHash = hashAuthToken(rawToken)
    const link = await em.findOne(Entity, { tokenHash, deletedAt: null } as FilterQuery<TEntity>, { refresh: true })
    if (!link || !hashesMatch(link.tokenHash, tokenHash)) return null
    if (lookup.scope) {
      const { tenantId, organizationId } = lookup.scope
      if (link.tenantId !== tenantId || link.organizationId !== organizationId) return null
    }
    return link
  }

  async function assertActive(link: TEntity, now: Date): Promise<void> {
    const state = tokenLinkState(link, use, now)
    if (state === 'used') await foundationErrors.throw('token_link_used')
    if (state === 'expired') await foundationErrors.throw('token_link_expired')
  }

  const view = (link: TEntity): TokenLinkView<TEntity> => ({
    link,
    tenantId: link.tenantId,
    organizationId: link.organizationId,
  })

  return {
    async issue(em, subject, scope, issueOptions = {}) {
      const now = new Date()
      const latest = expiryFor(now, ttlMs)
      const expiresAt = issueOptions.expiresAt ?? latest
      if (expiresAt.getTime() <= now.getTime() || expiresAt.getTime() > latest.getTime()) {
        throw new RangeError('[internal] token link expiry must lie in the future and within the time to live')
      }
      const rawToken = generateAuthToken()
      const useColumns = use === 'single' ? { usedAt: null } : { usedCount: 0, lastUsedAt: null }
      const link = em.create(Entity, {
        ...subject,
        ...useColumns,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        tokenHash: hashAuthToken(rawToken),
        expiresAt,
      } as never)
      await em.persist(link).flush()
      return { rawToken, link }
    },

    async peek(em, rawToken, lookup = {}) {
      const link = await find(em, rawToken, lookup)
      if (!link) return null
      await assertActive(link, new Date())
      return view(link)
    },

    async inspect(em, rawToken, lookup = {}) {
      const link = await find(em, rawToken, lookup)
      if (!link) return null
      return { state: tokenLinkState(link, use, new Date()), view: view(link) }
    },

    async redeem(em, rawToken, lookup = {}) {
      const link = await find(em, rawToken, lookup)
      if (!link) return null
      const now = new Date()
      await assertActive(link, now)
      const where = {
        id: link.id,
        tenantId: link.tenantId,
        organizationId: link.organizationId,
        expiresAt: { $gt: now },
        ...(use === 'single' ? { usedAt: null } : {}),
      } as FilterQuery<TEntity>
      const spend =
        use === 'single'
          ? { usedAt: now, updatedAt: now }
          : { usedCount: raw('used_count + 1'), lastUsedAt: now, updatedAt: now }
      const affected = await em.nativeUpdate(Entity, where, spend as EntityData<TEntity>)
      if (affected !== 1) {
        // Another redemption won the race, or the link expired between the read and the update.
        const current = await find(em, rawToken, lookup)
        if (current && tokenLinkState(current, use, now) === 'used') await foundationErrors.throw('token_link_used')
        await foundationErrors.throw('token_link_expired')
      }
      return view((await find(em, rawToken, lookup)) ?? link)
    },
  }
}
