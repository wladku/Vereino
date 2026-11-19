// Pure rules of the "Online payment" group of B-20 (payments parity spec REQ-C14, DD-C11, V-C01; *Domain Vocabulary*
// → "Offered online methods", "Online payment connection"; issue #302 E12-S12): the methods a club offers its payers
// and the connection mode read from the stored Stripe credentials. Nothing here reads the database, and the
// connection rule never returns any part of a key.

/** The online methods a club may offer, in display order; the values are Stripe's `payment_method_types`. */
export const ONLINE_METHODS = ['card', 'blik', 'p24'] as const
export type OnlineMethod = (typeof ONLINE_METHODS)[number]

/** The default before the administrator chooses (Q-C15: card; BLIK and Przelewy24 after the sandbox run). */
export const DEFAULT_ONLINE_METHODS: readonly OnlineMethod[] = ['card']

function isOnlineMethod(value: unknown): value is OnlineMethod {
  return ONLINE_METHODS.includes(value as OnlineMethod)
}

/** True for a selection the settings refuse (422 `online_methods_invalid`): empty, an unknown value or a repeat. */
export function onlineMethodsInvalid(value: readonly unknown[]): boolean {
  return value.length === 0 || !value.every(isOnlineMethod) || new Set(value).size !== value.length
}

/**
 * The methods a club offers: the stored ones that are known, in display order; the default when none is left. The
 * checkout passes the result to the gateway as `paymentTypes`.
 */
export function offeredOnlineMethods(stored: readonly unknown[] | null | undefined): OnlineMethod[] {
  const known = ONLINE_METHODS.filter((method) => stored?.includes(method))
  return known.length > 0 ? known : [...DEFAULT_ONLINE_METHODS]
}

/** The connection badge: test or live mode, not connected, or `unknown` ("not verified") when it cannot be read. */
export const ONLINE_CONNECTIONS = ['connected_test', 'connected_live', 'not_connected', 'unknown'] as const
export type OnlineConnection = (typeof ONLINE_CONNECTIONS)[number]

/**
 * The connection mode of an organization's Stripe integration (V-C01): enabled with a publishable key starting
 * `pk_test_` → `connected_test`, `pk_live_` → `connected_live`; anything else → `not_connected`.
 */
export function onlineConnectionOf(input: {
  enabled: boolean
  credentials: Record<string, unknown> | null
}): Exclude<OnlineConnection, 'unknown'> {
  const key = input.credentials?.publishableKey
  if (!input.enabled || typeof key !== 'string') return 'not_connected'
  if (key.startsWith('pk_test_')) return 'connected_test'
  if (key.startsWith('pk_live_')) return 'connected_live'
  return 'not_connected'
}
