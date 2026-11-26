'use client'
// "Reset second factor" on the person record's "Sign-in methods" (staff second factor spec UI row; REQ-2F04, DD-2F07;
// J-2F03; #736). Shown only for a person who signs in with a second factor, to an administrator holding
// `foundation.second_factor.reset`, never on their own record (`secondFactor.canReset` of the identity list). The
// dialog requires a note on how the person was verified and an "I verified this person" confirmation; success removes
// the person's links, ends their sessions and reloads the list.
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { errorCodeOf } from '@vereino/core'
import { DialogContent } from '@/components/ui/dialog'

type SecondFactorState = { userId: string | null; required: boolean; canReset: boolean }

const NOTE_MIN = 3
const NOTE_MAX = 500

function resetErrorKey(code: string | null): string {
  if (code === 'second_factor_reset_self') return 'foundation.errors.second_factor_reset_self'
  if (code === 'not_found' || code === null) return 'foundation.secondFactor.reset.errors.gone'
  return 'foundation.secondFactor.reset.errors.failed'
}

export function SecondFactorReset({ url }: { url: string }) {
  const t = useT()
  const ids = React.useId()
  const queryClient = useQueryClient()
  // The same query as the identity list (`IdentityLinks`), so the list and this action share one request.
  const query = useQuery({
    queryKey: ['foundation-identity-links', url],
    queryFn: async () => {
      const call = await apiCall<{ secondFactor?: SecondFactorState }>(url)
      if (!call.ok || !call.result) throw new Error(String(call.status))
      return call.result
    },
  })
  const state = (query.data as { secondFactor?: SecondFactorState } | undefined)?.secondFactor
  const [open, setOpen] = React.useState(false)
  const [note, setNote] = React.useState('')
  const [verified, setVerified] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  if (!state?.canReset || !state.userId) return null
  const userId = state.userId
  const noteValid = note.trim().length >= NOTE_MIN && note.trim().length <= NOTE_MAX

  const close = () => {
    setOpen(false)
    setNote('')
    setVerified(false)
    setError(null)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!noteValid || !verified || pending) return
    setPending(true)
    setError(null)
    try {
      const call = await apiCall<{ code?: string }>('/api/foundation/second-factor/reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, note: note.trim() }),
      })
      if (call.ok) {
        flash(t('foundation.secondFactor.reset.success'), 'success')
        close()
        await queryClient.invalidateQueries({ queryKey: ['foundation-identity-links', url] })
        return
      }
      setError(t(resetErrorKey(call.status === 404 ? null : errorCodeOf(call.result))))
    } catch {
      setError(t('foundation.secondFactor.reset.errors.failed'))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-3" data-testid="second-factor-reset">
      <p className="text-muted-foreground text-sm">{t('foundation.secondFactor.reset.hint')}</p>
      <div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => setOpen(true)}
          data-testid="second-factor-reset-open"
        >
          {t('foundation.secondFactor.reset.action')}
        </Button>
      </div>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent data-testid="second-factor-reset-dialog">
          <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{t('foundation.secondFactor.reset.title')}</DialogTitle>
              <DialogDescription>{t('foundation.secondFactor.reset.description')}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${ids}-note`}>{t('foundation.secondFactor.reset.note')}</Label>
              <Textarea
                id={`${ids}-note`}
                value={note}
                maxLength={NOTE_MAX}
                required
                aria-describedby={`${ids}-note-help`}
                onChange={(event) => setNote(event.target.value)}
                data-testid="second-factor-reset-note"
              />
              <p id={`${ids}-note-help`} className="text-muted-foreground text-xs">
                {t('foundation.secondFactor.reset.noteHelp')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id={`${ids}-verified`}
                checked={verified}
                disabled={pending}
                onCheckedChange={(value) => setVerified(value === true)}
                data-testid="second-factor-reset-verified"
              />
              <Label htmlFor={`${ids}-verified`}>{t('foundation.secondFactor.reset.verified')}</Label>
            </div>
            <div aria-live="polite" role="status">
              {error ? (
                <p
                  className="border-status-error-border bg-status-error-bg text-status-error-text rounded-md border px-3 py-2 text-sm"
                  data-testid="second-factor-reset-error"
                >
                  {error}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" className="min-h-11" onClick={close}>
                {t('foundation.secondFactor.reset.cancel')}
              </Button>
              <Button
                type="submit"
                variant="destructive"
                className="min-h-11"
                disabled={!noteValid || !verified || pending}
                data-testid="second-factor-reset-confirm"
              >
                {t('foundation.secondFactor.reset.confirm')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
