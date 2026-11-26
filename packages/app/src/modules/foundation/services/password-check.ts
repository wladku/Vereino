// The Vereino password check on the server (#779, spec .ai/specs/2026-11-26-vereino-password-check.md): the platform
// policy (`OM_PASSWORD_*`), the built-in common/breached list, loaded on first use, and the context words of the club
// and the user, read inside the caller's tenant only. Used by `commands/interceptors.ts` and the reset-confirm route.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { User } from '@open-mercato/core/modules/auth/data/entities'
import { Organization } from '@open-mercato/core/modules/directory/data/entities'
import { getPasswordPolicy, validatePassword } from '@open-mercato/shared/lib/auth/passwordPolicy'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { foundationErrors } from '../api/errors'
import { PRODUCT_CONTEXT_WORDS, checkPassword, contextWords, type PasswordRefusal } from '../lib/password-check'

let commonPasswords: Promise<Set<string>> | null = null

/** The common/breached list as a set, built once per process; a failed load is retried on the next check. */
export function loadCommonPasswords(): Promise<Set<string>> {
  commonPasswords ??= import('../lib/common-passwords')
    .then(({ COMMON_PASSWORDS }) => new Set(COMMON_PASSWORDS.split('\n')))
    .catch((error: unknown) => {
      commonPasswords = null
      throw error
    })
  return commonPasswords
}

/** The rule `password` breaks, with the product words and the given names, addresses and slugs as context words. */
export async function refuseNewPassword(
  password: string,
  context: ReadonlyArray<string | null | undefined> = [],
): Promise<PasswordRefusal | null> {
  const common = await loadCommonPasswords()
  const policy = getPasswordPolicy()
  return checkPassword(password, {
    meetsPolicy: (value) => validatePassword(value, policy).ok,
    isCommon: (value) => common.has(value),
    contextWords: contextWords([...PRODUCT_CONTEXT_WORDS, ...context]),
  })
}

/** The coded 422 answer of a refusal: `{ error, code, issues: [{ path: ['password'], message }] }`. */
export async function passwordRefusalError(refusal: PasswordRefusal): Promise<CrudHttpError> {
  const error = await foundationErrors.create(refusal)
  const message = String(error.body.error)
  return new CrudHttpError(error.status, { ...error.body, issues: [{ path: ['password'], message }] })
}

export type PasswordContextTarget = {
  /** The caller's tenant; without it no record is read (missing scope is never unrestricted). */
  tenantId: string | null
  /** The user whose password changes, when it exists already. */
  userId?: string | null
  organizationId?: string | null
  email?: string | null
  name?: string | null
}

/** The club and user words of a password change: the organization's name and slug, the user's address and name. */
export async function passwordContext(container: AwilixContainer, target: PasswordContextTarget): Promise<string[]> {
  const words = [target.email, target.name]
  const { tenantId } = target
  if (!tenantId) return words.filter((word): word is string => Boolean(word))
  const em = container.resolve<EntityManager>('em').fork()
  let organizationId = target.organizationId ?? null
  if (target.userId) {
    const user = await findOneWithDecryption(
      em,
      User,
      { id: target.userId, tenantId, deletedAt: null },
      {},
      {
        tenantId,
        organizationId,
      },
    )
    if (user) {
      words.push(user.email, user.name)
      organizationId ??= user.organizationId ?? null
    }
  }
  if (organizationId) {
    const organization = await findOneWithDecryption(
      em,
      Organization,
      { id: organizationId, tenant: tenantId, deletedAt: null },
      undefined,
      { tenantId, organizationId },
    )
    if (organization) words.push(organization.name, organization.slug)
  }
  return words.filter((word): word is string => Boolean(word))
}
