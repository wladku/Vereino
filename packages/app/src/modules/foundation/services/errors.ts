// P-17 error factory (S6.7): turns a code of a module's `lib/error-codes.ts` table into the platform
// `CrudHttpError(status, { error, code })` with the message translated for the request. Each module binds it to
// its own table in `api/errors.ts` (S4.1).
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { findErrorCode, type ErrorCodeOf, type ErrorCodeTable } from '@vereino/core'

/** Extra response fields; `error` and `code` always come from the table. */
export type ErrorDetails = Record<string, unknown>

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
    return new CrudHttpError(entry.status, { ...details, error: translate(entry.messageKey, code), code })
  }
  return {
    create,
    async throw(code, details) {
      throw await create(code, details)
    },
  }
}
