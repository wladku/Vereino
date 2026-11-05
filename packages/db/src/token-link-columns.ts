// P-10 TokenLinkColumns (foundation spec *Data Models*, phase C): the columns a module's token-link table adds to
// `ScopedEntityBase` — the hash of the raw token, the expiry and the use columns of the table's policy. One table per
// purpose, so there is no `purpose` column; the subject and the targets are the module's own columns. The module
// declares the properties and applies the options with its own decorators, as with the other column helpers:
// `@Property(columns.tokenHash) tokenHash!: string`.
import type { PropertyOptions } from '@mikro-orm/core'

/** `single`: one redemption (`used_at`); `until_expiry`: any number of redemptions until `expires_at` (`used_count`). */
export type TokenLinkUse = 'single' | 'until_expiry'

export type TokenLinkColumnsOptions<TUse extends TokenLinkUse = TokenLinkUse> = {
  /** Column of the token hash; `token_hash` by default. The property is always `tokenHash`. */
  hashColumn?: string
  use: TokenLinkUse & TUse
}

type Column = PropertyOptions<object>

export type SingleUseTokenLinkColumns = { tokenHash: Column; expiresAt: Column; usedAt: Column }
export type UntilExpiryTokenLinkColumns = {
  tokenHash: Column
  expiresAt: Column
  usedCount: Column
  lastUsedAt: Column
}

/** The properties a token-link entity declares for its policy (what `createTokenLinkService` reads and writes). */
export type TokenLinkFields<TUse extends TokenLinkUse> = { tokenHash: string; expiresAt: Date } & (TUse extends 'single'
  ? { usedAt?: Date | null }
  : { usedCount: number; lastUsedAt?: Date | null })

const COLUMN_NAME_PATTERN = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/

/**
 * Fresh option objects for the token-link columns (the decorators mutate what they receive): the hash column (text,
 * unique — the unique index backs the system-scope lookup), `expires_at` and the use columns of `use`.
 */
export function tokenLinkColumns(options: TokenLinkColumnsOptions<'single'>): SingleUseTokenLinkColumns
export function tokenLinkColumns(options: TokenLinkColumnsOptions<'until_expiry'>): UntilExpiryTokenLinkColumns
export function tokenLinkColumns(
  options: TokenLinkColumnsOptions,
): SingleUseTokenLinkColumns | UntilExpiryTokenLinkColumns {
  const hashColumn = options.hashColumn ?? 'token_hash'
  if (!COLUMN_NAME_PATTERN.test(hashColumn)) {
    throw new RangeError(`[internal] token hash column ${JSON.stringify(hashColumn)} must be lower snake_case`)
  }
  // A JavaScript caller can pass any string; an unknown policy is a programming error, not a table without use columns.
  if (!Object.hasOwn(USE_COLUMNS, options.use)) {
    throw new RangeError(`[internal] unknown token link use ${JSON.stringify(options.use)}`)
  }
  return USE_COLUMNS[options.use]({
    tokenHash: { name: hashColumn, type: 'text', unique: true },
    expiresAt: { name: 'expires_at', type: Date },
  })
}

type BaseTokenLinkColumns = { tokenHash: Column; expiresAt: Column }

const USE_COLUMNS: {
  single: (base: BaseTokenLinkColumns) => SingleUseTokenLinkColumns
  until_expiry: (base: BaseTokenLinkColumns) => UntilExpiryTokenLinkColumns
} = {
  single: (base) => ({ ...base, usedAt: { name: 'used_at', type: Date, nullable: true } }),
  until_expiry: (base) => ({
    ...base,
    usedCount: { name: 'used_count', type: 'integer', default: 0 },
    lastUsedAt: { name: 'last_used_at', type: Date, nullable: true },
  }),
}
