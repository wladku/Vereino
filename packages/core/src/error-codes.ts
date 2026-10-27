// P-17 error-code tables (engineering standards S6.7): each module declares its codes once, as plain data in
// `lib/error-codes.ts` (`export const errorCodes = [...] as const satisfies ErrorCodeTable`), which
// `contracts:check` reads and the module's `api/errors.ts` factory throws.

/** HTTP statuses a coded error may carry (S6.7 status semantics). */
export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 410 | 413 | 422 | 429 | 502 | 503

export type ErrorCodeEntry = {
  /** Lower snake_case machine code, unique across the app. */
  readonly code: string
  readonly status: ErrorStatus
  /** i18n key of the message, starting with `<module id>.`. */
  readonly messageKey: string
}

export type ErrorCodeTable = readonly ErrorCodeEntry[]

/** The union of the codes a table declares. */
export type ErrorCodeOf<T extends ErrorCodeTable> = T[number]['code']

/** The entry of `code` in `table`; throws an internal error for a code the table does not declare. */
export function findErrorCode<T extends ErrorCodeTable>(table: T, code: ErrorCodeOf<T>): T[number] {
  const entry = table.find((candidate) => candidate.code === code)
  if (!entry) throw new Error(`[internal] error code ${code} is not declared in this table`)
  return entry
}
