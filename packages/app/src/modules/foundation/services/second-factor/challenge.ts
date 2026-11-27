// The challenge store of the staff second factor (spec DD-2F04, DD-2F08; #736): the single-use marker in the platform
// cache (global scope, like the OAuth state of DD-S04), the advisory lock its read-modify-write runs under, the code
// e-mail and the end of the challenged platform session. Every failure here is reported by fingerprint and ends with
// no session (fail closed, REQ-2F05); nothing logs a code, a challenge id or an address.
import React from 'react'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { runWithCacheTenant, type CacheStrategy } from '@open-mercato/cache'
import type { AuthService } from '@open-mercato/core/modules/auth/services/authService'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { getTelemetryRuntime } from '@open-mercato/shared/lib/telemetry/runtime'
import {
  CHALLENGE_TTL_MS,
  challengeKey,
  challengeLockKey,
  displayCode,
  parseChallengeMarker,
  type ChallengeMarker,
} from '../../lib/second-factor'
import { emailSender } from '../email-sender'

const logger = createLogger('foundation').child({ component: 'second-factor' })

/** The fingerprints of the spec's *Observability* row. */
export type SecondFactorFingerprint =
  | 'foundation.second_factor.unavailable'
  | 'foundation.second_factor.locked'
  | 'foundation.second_factor.provider_refused'

/** Logs and reports a second-factor failure by its fingerprint; `details` carries codes and ids only. */
export function reportSecondFactor(fingerprint: SecondFactorFingerprint, details: Record<string, unknown> = {}): void {
  logger.warn('Second factor', { fingerprint, ...details })
  const error = Object.assign(new Error(`[internal] ${fingerprint}`), { fingerprint })
  getTelemetryRuntime()?.reportError(error, { module: 'foundation', code: fingerprint })
}

/** The store or the lock is down: the caller answers 503 `second_factor_unavailable`. */
export class SecondFactorUnavailable extends Error {
  override name = 'SecondFactorUnavailable'
}

function cacheOf(container: AwilixContainer): CacheStrategy {
  return container.resolve<CacheStrategy>('cache')
}

/** Stores the marker until its expiry; throws `SecondFactorUnavailable` when the store is down. */
export async function storeChallenge(
  container: AwilixContainer,
  challengeId: string,
  marker: ChallengeMarker,
): Promise<void> {
  const ttl = Math.max(1, marker.expiresAt - Date.now())
  try {
    await runWithCacheTenant(null, () =>
      cacheOf(container).set(challengeKey(challengeId), JSON.stringify(marker), {
        ttl: Math.min(ttl, CHALLENGE_TTL_MS),
      }),
    )
  } catch (error: unknown) {
    reportSecondFactor('foundation.second_factor.unavailable', { step: 'store', err: error })
    throw new SecondFactorUnavailable('challenge store unavailable')
  }
}

/** The marker of a challenge, or null when there is none; throws `SecondFactorUnavailable` when the store is down. */
export async function readChallenge(container: AwilixContainer, challengeId: string): Promise<ChallengeMarker | null> {
  try {
    const value = await runWithCacheTenant(null, () => cacheOf(container).get(challengeKey(challengeId)))
    return value == null ? null : parseChallengeMarker(value)
  } catch (error: unknown) {
    reportSecondFactor('foundation.second_factor.unavailable', { step: 'read', err: error })
    throw new SecondFactorUnavailable('challenge store unavailable')
  }
}

/** Deletes a marker; a store failure is reported, never thrown (the marker expires on its own). */
export async function deleteChallenge(container: AwilixContainer, challengeId: string): Promise<void> {
  try {
    await runWithCacheTenant(null, () => cacheOf(container).delete(challengeKey(challengeId)))
  } catch (error: unknown) {
    reportSecondFactor('foundation.second_factor.unavailable', { step: 'delete', err: error })
  }
}

/**
 * Runs `work` under the challenge's transaction-scoped advisory lock (DD-2F08), so parallel `verify` and `resend`
 * calls of one challenge are serialized. The lock or the transaction failing throws `SecondFactorUnavailable`.
 */
export async function withChallengeLock<T>(
  container: AwilixContainer,
  challengeId: string,
  work: () => Promise<T>,
): Promise<T> {
  const em = container.resolve<EntityManager>('em').fork()
  let locked = false
  try {
    return await em.transactional(async (tx) => {
      await tx.execute('select pg_advisory_xact_lock(hashtextextended(?, 0))', [challengeLockKey(challengeId)])
      locked = true
      return work()
    })
  } catch (error: unknown) {
    if (locked) throw error
    reportSecondFactor('foundation.second_factor.unavailable', { step: 'lock', err: error })
    throw new SecondFactorUnavailable('challenge lock unavailable')
  }
}

/** Ends the challenged platform session; a failure is reported (the session cannot be refreshed without its token). */
export async function endPlatformSession(container: AwilixContainer, sessionId: string): Promise<void> {
  try {
    await container.resolve<AuthService>('authService').deleteSessionById(sessionId)
  } catch (error: unknown) {
    reportSecondFactor('foundation.second_factor.unavailable', { step: 'end_session', err: error })
  }
}

const SEND_TIMEOUT_MS = 10_000

/**
 * Sends the code to the account's own address in the request's locale, synchronously with a 10 s timeout (the person
 * is waiting on the page). Throws `SecondFactorUnavailable` on a failure or a timeout; the caller ends the challenge.
 */
export async function sendCodeEmail(
  container: AwilixContainer,
  message: { to: string; code: string; tenantId: string; organizationId: string },
): Promise<void> {
  const { translate } = await resolveTranslations()
  const code = displayCode(message.code)
  const subject = translate('foundation.secondFactor.email.subject', 'Your Vereino sign-in code: {code}', { code })
  const lines = [
    translate('foundation.secondFactor.email.intro', 'Use this code to finish signing in to Vereino:'),
    code,
    translate('foundation.secondFactor.email.expiry', 'The code is valid for 10 minutes and can be used once.'),
    translate(
      'foundation.secondFactor.email.ignore',
      'If you did not try to sign in, change your password and tell your club administrator.',
    ),
  ]
  const react = React.createElement(
    'div',
    null,
    ...lines.map((line, index) => React.createElement('p', { key: index }, line)),
  )
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      emailSender(container).send({
        to: message.to,
        subject,
        react,
        tenantId: message.tenantId,
        organizationId: message.organizationId,
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('[internal] send timed out'))
        }, SEND_TIMEOUT_MS)
      }),
    ])
  } catch (error: unknown) {
    reportSecondFactor('foundation.second_factor.unavailable', { step: 'email', err: error })
    throw new SecondFactorUnavailable('code e-mail failed')
  } finally {
    if (timer) clearTimeout(timer)
  }
}
