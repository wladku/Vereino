// The `people` error factory, bound to its own error-code table (S4.1, S6.7).
import { errors } from '@/modules/foundation'
import { errorCodes } from '../lib/error-codes'

export const peopleErrors = errors(errorCodes)
