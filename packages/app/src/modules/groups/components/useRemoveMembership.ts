'use client'
// "Remove" of a roster row (parity spec REQ-A03, J-A01 steps 2 and 5; #267), shared by the panel roster (B-12) and the
// phone roster (`/club/groups/[id]`, REQ-A11, #274): a confirmation that says issued charges stay, then
// `DELETE /api/groups/memberships?id=` with the row's version. A started membership that was used answers 409
// `membership_in_use`: an active one is then offered End instead (an ended one keeps its last day); a stale version
// goes through the platform's conflict UI; any other refusal is flashed. The roster is refreshed in every case.
import * as React from 'react'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { errorCodeOf } from '@vereino/core'
import { errorMessage, personName, rowStatus, type MembershipRow } from './client-helpers'

export function useRemoveMembership({
  today,
  refresh,
  onEndInstead,
}: {
  today: string
  refresh: () => Promise<void>
  /** Opens "End membership" for a used active row the coordinator chose to end instead. */
  onEndInstead: (row: MembershipRow) => void
}) {
  const t = useT()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const remove = React.useCallback(
    async (row: MembershipRow) => {
      const name = personName(row.person) || t('groups.memberships.unknownPerson')
      const confirmed = await confirm({
        title: t('groups.memberships.confirm.remove.title', { name }),
        text: t('groups.memberships.confirm.remove.text'),
        confirmText: t('groups.memberships.actions.remove'),
        variant: 'destructive',
      })
      if (!confirmed) return
      try {
        await withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updatedAt), () =>
          apiCallOrThrow(
            `/api/groups/memberships?id=${encodeURIComponent(row.id)}`,
            { method: 'DELETE' },
            { errorMessage: t('groups.memberships.errors.remove') },
          ),
        )
        flash(t('groups.memberships.flash.removed', { name }), 'success')
      } catch (error: unknown) {
        if (errorCodeOf(error) === 'membership_in_use' && rowStatus(row, today) === 'active') {
          // J-A01 step 5: a used active membership is ended instead; an ended one keeps its last day.
          const endInstead = await confirm({
            title: t('groups.memberships.confirm.inUse.title'),
            text: t('groups.memberships.confirm.inUse.text', { name }),
            confirmText: t('groups.memberships.actions.end'),
          })
          if (endInstead) onEndInstead(row)
        } else if (!surfaceRecordConflict(error, t, { onRefresh: () => void refresh() })) {
          flash(errorMessage(error, t('groups.memberships.errors.remove')), 'error')
        }
      } finally {
        await refresh()
      }
    },
    [confirm, t, today, refresh, onEndInstead],
  )
  return { remove, ConfirmDialogElement }
}
