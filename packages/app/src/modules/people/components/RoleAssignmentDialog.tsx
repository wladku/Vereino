'use client'
// The dialogs of a role assignment on the "Roles" tab (people life-cycle spec REQ-L12, B-10 `?tab=roles`, #304):
// "Edit" changes the period and the scope (the section of a coordinator, the place of a facility attendant) through
// `PUT /api/people/role-assignments`; "End on…" sets the last active day — today by default, or a later or earlier
// date, like the coordinator "until" date of `SectionCoordinators.tsx` — through `POST …/{id}/end`. Both send the
// assignment's lock token; a stale token surfaces the conflict, an inverted period (422 `validity_inverted`) stays in
// the dialog with the server's message.
import * as React from 'react'
import { LookupSelect, type LookupSelectItem } from '@open-mercato/ui/backend/inputs'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Button } from '@open-mercato/ui/primitives/button'
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useClubToday } from '@vereino/ui'
import { DialogContent } from '@/components/ui/dialog'
import { errorMessage, type RoleAssignmentRow } from './client-helpers'

export type RoleAssignmentDialogMode = 'edit' | 'end'

type LookupFetcher = (search: string) => Promise<LookupSelectItem[]>

export function RoleAssignmentDialog({
  mode,
  row,
  title,
  fetchSections,
  fetchPlaces,
  onClose,
  onDone,
}: {
  mode: RoleAssignmentDialogMode
  row: RoleAssignmentRow
  /** The role and its scope, as the tab lists them. */
  title: string
  fetchSections: LookupFetcher
  fetchPlaces: LookupFetcher
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const t = useT()
  const today = useClubToday()
  const problemId = React.useId()
  const [validFrom, setValidFrom] = React.useState(row.validFrom ?? today)
  const [validTo, setValidTo] = React.useState(mode === 'end' ? today : (row.validTo ?? ''))
  const [sectionId, setSectionId] = React.useState<string | null>(row.sectionId)
  const [placeId, setPlaceId] = React.useState<string | null>(row.placeId ?? null)
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const needsSection = row.role === 'coordinator'
  const needsPlace = row.role === 'facility_operator'
  const failure = t(mode === 'edit' ? 'people.roles.errors.save' : 'people.roles.errors.end')
  const ready =
    mode === 'end'
      ? Boolean(validTo)
      : Boolean(validFrom) && (!needsSection || Boolean(sectionId)) && (!needsPlace || Boolean(placeId))

  const submit = async () => {
    if (!ready) return
    setPending(true)
    setProblem(null)
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updatedAt), () =>
        mode === 'edit'
          ? apiCallOrThrow(
              '/api/people/role-assignments',
              {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  id: row.id,
                  validFrom,
                  validTo: validTo || null,
                  ...(needsSection ? { sectionId } : {}),
                  ...(needsPlace ? { placeId } : {}),
                }),
              },
              { errorMessage: failure },
            )
          : apiCallOrThrow(
              `/api/people/role-assignments/${encodeURIComponent(row.id)}/end`,
              { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ validTo }) },
              { errorMessage: failure },
            ),
      )
      flash(t(mode === 'edit' ? 'people.roles.flash.saved' : 'people.roles.flash.ended'), 'success')
      onClose()
      await onDone()
    } catch (error: unknown) {
      if (surfaceRecordConflict(error, t, { onRefresh: () => void onDone() })) onClose()
      else setProblem(errorMessage(error, failure))
    } finally {
      setPending(false)
    }
  }

  const lookupLabels = {
    loadingLabel: t('people.common.loading'),
    clearLabel: t('people.common.clear'),
    selectLabel: t('people.common.select'),
    selectedLabel: t('people.common.selected'),
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent closeAriaLabel={t('people.common.cancel')} data-testid={`people-role-${mode}-dialog`}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            // The dialog renders in a portal, but React bubbles the submit through the component tree.
            event.stopPropagation()
            void submit()
          }}
        >
          <DialogHeader>
            <DialogTitle>{t(mode === 'edit' ? 'people.roles.edit.title' : 'people.roles.end.title')}</DialogTitle>
            <DialogDescription>
              <span className="text-foreground block font-medium">{title}</span>
              {mode === 'end' ? t('people.roles.end.help') : null}
            </DialogDescription>
          </DialogHeader>
          {mode === 'edit' && needsSection ? (
            <div className="flex flex-col gap-1">
              <Label>{t('people.roles.fields.section')}</Label>
              <LookupSelect
                value={sectionId}
                onChange={setSectionId}
                fetchItems={fetchSections}
                minQuery={0}
                placeholder={t('people.roles.fields.section.placeholder')}
                searchPlaceholder={t('people.roles.fields.section.search')}
                emptyLabel={t('people.roles.fields.section.empty')}
                disabled={pending}
                {...lookupLabels}
              />
            </div>
          ) : null}
          {mode === 'edit' && needsPlace ? (
            <div className="flex flex-col gap-1">
              <Label>{t('people.roles.fields.place')}</Label>
              <LookupSelect
                value={placeId}
                onChange={setPlaceId}
                fetchItems={fetchPlaces}
                minQuery={0}
                placeholder={t('people.roles.fields.place.placeholder')}
                searchPlaceholder={t('people.roles.fields.place.search')}
                emptyLabel={t('people.roles.fields.place.empty')}
                disabled={pending}
                {...lookupLabels}
              />
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {mode === 'edit' ? (
              <div className="flex flex-col gap-1">
                <Label htmlFor="people-role-edit-from">{t('people.roles.fields.validFrom')}</Label>
                <Input
                  id="people-role-edit-from"
                  type="date"
                  required
                  value={validFrom}
                  disabled={pending}
                  aria-describedby={problem ? problemId : undefined}
                  onChange={(event) => {
                    setValidFrom(event.target.value)
                  }}
                />
              </div>
            ) : null}
            <div className="flex flex-col gap-1">
              <Label htmlFor={`people-role-${mode}-to`}>
                {t(mode === 'edit' ? 'people.roles.fields.validTo' : 'people.roles.fields.endOn')}
              </Label>
              <Input
                id={`people-role-${mode}-to`}
                type="date"
                required={mode === 'end'}
                value={validTo}
                disabled={pending}
                aria-describedby={problem ? problemId : undefined}
                onChange={(event) => {
                  setValidTo(event.target.value)
                }}
              />
            </div>
          </div>
          {problem ? (
            <p
              id={problemId}
              className="text-destructive text-sm"
              role="alert"
              data-testid="people-role-dialog-problem"
            >
              {problem}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              {t('people.common.cancel')}
            </Button>
            <Button
              type="submit"
              variant={mode === 'end' ? 'destructive-solid' : 'default'}
              disabled={pending || !ready}
              data-testid={`people-role-${mode}-submit`}
            >
              {t(mode === 'edit' ? 'people.common.save' : 'people.roles.actions.end')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
