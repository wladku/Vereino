// The foundation's error factory, bound to its own error-code table (S4.1, S6.7).
import { errorCodes } from '../lib/error-codes'
import { errors } from '../services/errors'

export const foundationErrors = errors(errorCodes)
