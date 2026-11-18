// `DELETE /api/payments/bank-imports/{id}` — deleting a bank import (payments parity spec REQ-C04, DD-C13, Contract 5;
// issue #294, B-29): removes an import from which nothing was ever booked — its transactions, the import and its
// statement file — so the corrected file imports again. Sends the import's lock token in the platform optimistic-lock
// header; 409 `bank_import_has_bookings` when a payment row ever named one of its transactions.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { BankImportDeleteResult } from '../../../commands/bank'
import { errorSchema } from '../../shared'

export const metadata = {
  DELETE: { requireAuth: true, requireFeatures: ['payments.bank.import'] },
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = z.object({ id: z.uuid() }).parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, BankImportDeleteResult>('payments.bank_imports.delete', { input: { id }, ctx })
    return new Response(null, { status: 204 })
  } catch (error: unknown) {
    return errorResponse(error, 'payments.bank_imports.delete')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Delete a bank statement import',
  methods: {
    DELETE: {
      summary: 'Delete a bank statement import',
      description:
        'Removes an import from which nothing was ever booked: its transactions, the import and its statement file, so the same file can be imported again. Send the import’s lock token (`updatedAt` from the history) in the platform optimistic-lock header (400 `lock_token_required` without it). Audited, not undoable.',
      responses: [{ status: 204, description: 'Deleted' }],
      errors: [
        { status: 400, description: 'Invalid input, `lock_token_required`', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        {
          status: 409,
          description:
            '`bank_import_has_bookings` (a transfer of the import was recorded, even if undone since), `optimistic_lock_conflict`',
          schema: errorSchema,
        },
      ],
    },
  },
}
