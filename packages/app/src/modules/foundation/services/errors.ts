// P-17 error factory (S6.7): turns a code of a module's `lib/error-codes.ts` table into the platform
// `CrudHttpError(status, { error, code })` with the message translated for the request. Each module binds it to
// its own table in `api/errors.ts` (S4.1).
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { findErrorCode, type ErrorCodeOf, type ErrorCodeTable } from '@vereino/core'

/**
 * Extra response fields; `error` and `code` always come from the table. Their string and number values also fill the
 * message's `{placeholders}` (e.g. "The amount exceeds the remaining {remaining}", #109).
 */
export type ErrorDetails = Record<string, unknown>

function messageParams(details: ErrorDetails | undefined): Record<string, string | number> | undefined {
  if (!details) return undefined
  const params: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(details)) {
    if (typeof value === 'string' || typeof value === 'number') params[key] = value
  }
  return params
}

export type ModuleErrors<TCode extends string> = {
  /** Builds the coded error with the translated message. */
  create(code: TCode, details?: ErrorDetails): Promise<CrudHttpError>
  /** Builds and throws the coded error. */
  throw(code: TCode, details?: ErrorDetails): Promise<never>
}

export function errors<const TTable extends ErrorCodeTable>(table: TTable): ModuleErrors<ErrorCodeOf<TTable>> {
  const create = async (code: ErrorCodeOf<TTable>, details?: ErrorDetails): Promise<CrudHttpError> => {
    const entry = findErrorCode(table, code)
    const { translate } = await resolveTranslations()
    return new CrudHttpError(entry.status, {
      ...details,
      error: translate(entry.messageKey, code, messageParams(details)),
      code,
    })
  }
  return {
    create,
    async throw(code, details) {
      throw await create(code, details)
    },
  }
}
