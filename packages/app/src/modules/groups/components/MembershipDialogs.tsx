'use client'
// The roster dialogs of B-12 (parity spec REQ-A03, J-A01; #267): "Add to roster" and "Edit" (person, role, From and an
// optional To) and "End membership" (a chosen last day, default today). The add dialog searches first and last names
// (`GET /api/people/persons?search=`), shows "First Last (age N)" and leaves out the group's current members. A coded
// refusal stays in the dialog (409 `membership_overlap`, 422 `membership_not_started`, `validity_inverted`); a stale
// version closes the dialog through the platform's conflict UI. Escape cancels, Ctrl/Cmd+Enter saves. On the phone
// roster (`/club/groups/[id]`, REQ-A11, #274) the same forms open as bottom sheets (`surface="sheet"`) with full-width
// buttons.
import * as React from 'react'
import { LookupSelect, type LookupSelectItem } from '@open-mercato/ui/backend/inputs'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@open-mercato/ui/primitives/sheet'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { ROSTER_ROLE_ORDER, type MembershipRole } from '../lib/groups-rules'
import { errorMessage, personName, roleLabel, type MembershipRow, type Translate } from './client-helpers'

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/

export type PersonOption = { id: string; firstName: string | null; lastName: string | null; age?: number | null }

/** "First Last (age N)" (B-12); the name alone without a birth date. */
export function personOptionLabel(t: Translate, person: PersonOption): string {
  const name = personName(person) || person.id
  return typeof person.age === 'number' ? t('groups.memberships.personOption', { name, age: person.age }) : name
}

/** The ids of the persons with an active or upcoming membership of the group (every page; a roster may pass 100). */
async function currentMemberIds(groupId: string): Promise<Set<string>> {
  const ids = new Set<string>()
  for (const status of ['active', 'upcoming'] as const) {
    let page = 1
    let totalPages = 1
    do {
      const data = await fetchCrudList<MembershipRow>('groups/memberships', { groupId, status, page, pageSize: 100 })
      for (const row of data.items) if (row.personId) ids.add(row.personId)
      totalPages = data.totalPages ?? 1
      page += 1
    } while (page <= totalPages)
  }
  return ids
}

/** Submits on Ctrl/Cmd+Enter (the dialog's keyboard contract). */
function submitOnCtrlEnter(submit: () => void) {
  return (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      submit()
    }
  }
}

function Problem({ id, text }: { id: string; text: string | null }) {
  return text ? (
    <p id={id} className="text-destructive text-sm" role="alert">
      {text}
    </p>
  ) : null
}

/** A centred dialog in the panel (B-12), a bottom sheet on the phone roster (REQ-A11). */
export type FormSurface = 'dialog' | 'sheet'

/** The footer buttons' width: full width in a sheet, so a thumb reaches them (44 px targets either way). */
function buttonClass(surface: FormSurface): string {
  return surface === 'sheet' ? 'min-h-11 w-full sm:w-auto' : 'min-h-11'
}

function FormFrame({
  surface,
  open,
  onOpenChange,
  testId,
  title,
  description,
  onSubmitShortcut,
  footer,
  children,
}: {
  surface: FormSurface
  open: boolean
  onOpenChange: (open: boolean) => void
  testId: string
  title: string
  description: string
  onSubmitShortcut: () => void
  footer: React.ReactNode
  children: React.ReactNode
}) {
  const t = useT()
  if (surface === 'sheet') {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="max-h-dvh rounded-t-xl"
          closeLabel={t('groups.common.close')}
          data-testid={testId}
          onKeyDown={submitOnCtrlEnter(onSubmitShortcut)}
        >
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 overflow-y-auto px-4">{children}</div>
          <SheetFooter>{footer}</SheetFooter>
        </SheetContent>
      </Sheet>
    )
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeAriaLabel={t('groups.common.close')}
        data-testid={testId}
        onKeyDown={submitOnCtrlEnter(onSubmitShortcut)}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export type MembershipDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `dialog` by default. */
  surface?: FormSurface
  groupId: string
  groupKind: string | null
  today: string
  /** The membership to edit; a new membership without it. */
  membership?: MembershipRow | null
  /** The person and role the add dialog starts with (`?personId=…&role=…`, spec L J-L07). */
  initialPerson?: { id: string; label: string } | null
  initialRole?: MembershipRole | null
  onSaved: () => void | Promise<void>
  onRefresh: () => void
}

export function MembershipDialog({
  open,
  onOpenChange,
  surface = 'dialog',
  groupId,
  groupKind,
  today,
  membership,
  initialPerson,
  initialRole,
  onSaved,
  onRefresh,
}: MembershipDialogProps) {
  const t = useT()
  const ids = React.useId()
  const editing = Boolean(membership)
  const [personId, setPersonId] = React.useState<string | null>(membership?.personId ?? initialPerson?.id ?? null)
  const [role, setRole] = React.useState<string>(membership?.role ?? initialRole ?? 'participant')
  const [validFrom, setValidFrom] = React.useState(membership?.validFrom ?? today)
  const [validTo, setValidTo] = React.useState(membership?.validTo ?? '')
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const members = React.useRef<Promise<Set<string>> | null>(null)

  const fetchPersons = React.useCallback(
    async (search: string): Promise<LookupSelectItem[]> => {
      members.current ??= currentMemberIds(groupId).catch(() => new Set<string>())
      const params: Record<string, string | number> = { pageSize: 50 }
      if (search.trim().length >= 2) params.search = search.trim()
      const [data, current] = await Promise.all([
        fetchCrudList<PersonOption>('people/persons', params),
        members.current,
      ])
      const items = data.items
        .filter((person) => !current.has(person.id))
        .map((person) => ({ id: person.id, title: personOptionLabel(t, person) }))
      // The deep-linked person (`?personId=`) stays offered while the search is empty.
      if (initialPerson && !search.trim() && !items.some((item) => item.id === initialPerson.id)) {
        return [{ id: initialPerson.id, title: initialPerson.label }, ...items]
      }
      return items
    },
    [groupId, initialPerson, t],
  )

  const submit = async () => {
    if (pending) return
    if (!editing && !personId) {
      setProblem(t('groups.memberships.errors.personRequired'))
      return
    }
    if (!CALENDAR_DATE.test(validFrom) || (validTo && !CALENDAR_DATE.test(validTo))) {
      setProblem(t('groups.memberships.errors.dates'))
      return
    }
    setPending(true)
    setProblem(null)
    try {
      if (membership) {
        await withScopedApiRequestHeaders(buildOptimisticLockHeader(membership.updatedAt), () =>
          apiCallOrThrow(
            '/api/groups/memberships',
            {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ id: membership.id, role, validFrom, validTo: validTo || null }),
            },
            { errorMessage: t('groups.memberships.errors.save') },
          ),
        )
      } else {
        await apiCallOrThrow(
          '/api/groups/memberships',
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ groupId, personId, role, validFrom, ...(validTo ? { validTo } : {}) }),
          },
          { errorMessage: t('groups.memberships.errors.add') },
        )
      }
      onOpenChange(false)
      await onSaved()
    } catch (error: unknown) {
      if (membership && surfaceRecordConflict(error, t, { onRefresh })) {
        onOpenChange(false)
        return
      }
      setProblem(errorMessage(error, t(editing ? 'groups.memberships.errors.save' : 'groups.memberships.errors.add')))
    } finally {
      setPending(false)
    }
  }

  const name = membership ? personName(membership.person) || t('groups.memberships.unknownPerson') : null
  const footer = (
    <>
      <Button
        type="button"
        variant="outline"
        className={buttonClass(surface)}
        disabled={pending}
        onClick={() => {
          onOpenChange(false)
        }}
      >
        {t('groups.common.cancel')}
      </Button>
      <Button
        type="button"
        className={buttonClass(surface)}
        disabled={pending}
        data-testid="groups-membership-save"
        onClick={() => {
          void submit()
        }}
      >
        {t('groups.common.save')}
      </Button>
    </>
  )
  return (
    <FormFrame
      surface={surface}
      open={open}
      onOpenChange={onOpenChange}
      testId="groups-membership-dialog"
      title={editing ? t('groups.memberships.edit.title') : t('groups.memberships.actions.add')}
      description={name ?? t('groups.memberships.add.help')}
      onSubmitShortcut={() => void submit()}
      footer={footer}
    >
      <div className="flex flex-col gap-4">
        {editing ? null : (
          <div className="flex flex-col gap-1" data-testid="groups-membership-person">
            <Label>{t('groups.memberships.fields.person')}</Label>
            <LookupSelect
              value={personId}
              onChange={setPersonId}
              fetchItems={fetchPersons}
              minQuery={0}
              placeholder={t('groups.memberships.fields.person.placeholder')}
              searchPlaceholder={t('groups.memberships.fields.person.search')}
              emptyLabel={t('groups.memberships.fields.person.empty')}
              loadingLabel={t('groups.common.loading')}
              clearLabel={t('groups.common.clear')}
              selectLabel={t('groups.common.select')}
              selectedLabel={t('groups.common.selected')}
              disabled={pending}
            />
          </div>
        )}
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${ids}-role`}>{t('groups.memberships.fields.role')}</Label>
          <Select value={role} onValueChange={setRole} disabled={pending}>
            <SelectTrigger id={`${ids}-role`} className="min-h-11" data-testid="groups-membership-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROSTER_ROLE_ORDER.map((value) => (
                <SelectItem key={value} value={value}>
                  {roleLabel(t, value, groupKind)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${ids}-from`}>{t('groups.memberships.fields.validFrom')}</Label>
            <Input
              id={`${ids}-from`}
              type="date"
              className="min-h-11"
              required
              value={validFrom}
              disabled={pending}
              data-testid="groups-membership-from"
              onChange={(event) => {
                setValidFrom(event.target.value)
              }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${ids}-to`}>{t('groups.memberships.fields.validTo')}</Label>
            <Input
              id={`${ids}-to`}
              type="date"
              className="min-h-11"
              min={validFrom || undefined}
              value={validTo}
              disabled={pending}
              data-testid="groups-membership-to"
              onChange={(event) => {
                setValidTo(event.target.value)
              }}
            />
          </div>
        </div>
        <Problem id={`${ids}-problem`} text={problem} />
      </div>
    </FormFrame>
  )
}

export type EndMembershipDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `dialog` by default. */
  surface?: FormSurface
  membership: MembershipRow
  today: string
  onSaved: () => void | Promise<void>
  onRefresh: () => void
}

/** "End membership": the last day the person belongs to the group (default today, not before From). */
export function EndMembershipDialog({
  open,
  onOpenChange,
  surface = 'dialog',
  membership,
  today,
  onSaved,
  onRefresh,
}: EndMembershipDialogProps) {
  const t = useT()
  const ids = React.useId()
  const firstDay = membership.validFrom ?? undefined
  const [lastDay, setLastDay] = React.useState(firstDay && firstDay > today ? firstDay : today)
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const name = personName(membership.person) || t('groups.memberships.unknownPerson')

  const submit = async () => {
    if (pending) return
    if (!CALENDAR_DATE.test(lastDay)) {
      setProblem(t('groups.memberships.errors.dates'))
      return
    }
    setPending(true)
    setProblem(null)
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(membership.updatedAt), () =>
        apiCallOrThrow(
          `/api/groups/memberships/${membership.id}/end`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ validTo: lastDay }),
          },
          { errorMessage: t('groups.memberships.errors.end') },
        ),
      )
      onOpenChange(false)
      await onSaved()
    } catch (error: unknown) {
      if (surfaceRecordConflict(error, t, { onRefresh })) {
        onOpenChange(false)
        return
      }
      setProblem(errorMessage(error, t('groups.memberships.errors.end')))
    } finally {
      setPending(false)
    }
  }

  const footer = (
    <>
      <Button
        type="button"
        variant="outline"
        className={buttonClass(surface)}
        disabled={pending}
        onClick={() => {
          onOpenChange(false)
        }}
      >
        {t('groups.common.cancel')}
      </Button>
      <Button
        type="button"
        variant="destructive"
        className={buttonClass(surface)}
        disabled={pending}
        data-testid="groups-membership-end-save"
        onClick={() => {
          void submit()
        }}
      >
        {t('groups.memberships.actions.end')}
      </Button>
    </>
  )
  return (
    <FormFrame
      surface={surface}
      open={open}
      onOpenChange={onOpenChange}
      testId="groups-membership-end-dialog"
      title={t('groups.memberships.actions.endFor', { name })}
      description={t('groups.memberships.end.help')}
      onSubmitShortcut={() => void submit()}
      footer={footer}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${ids}-last`}>{t('groups.memberships.fields.lastDay')}</Label>
          <Input
            id={`${ids}-last`}
            type="date"
            className="min-h-11 sm:w-60"
            required
            min={firstDay}
            value={lastDay}
            disabled={pending}
            data-testid="groups-membership-last-day"
            onChange={(event) => {
              setLastDay(event.target.value)
            }}
          />
        </div>
        <Problem id={`${ids}-problem`} text={problem} />
      </div>
    </FormFrame>
  )
}
