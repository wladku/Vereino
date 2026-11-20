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
import { ROSTER_ROLE_ORDER, moveDateBounds, type MembershipRole } from '../lib/groups-rules'
import {
  errorMessage,
  personName,
  roleLabel,
  type GroupRow,
  type MembershipRow,
  type Translate,
} from './client-helpers'

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

/** The field a dialog problem is about, so that field points at the message (`aria-invalid`, `aria-describedby`). */
type ProblemField = 'person' | 'dates' | null

/** The `aria-invalid` and `aria-describedby` of a field: set only while the shown problem is about it. */
function invalidProps(about: boolean, problemId: string): { 'aria-invalid'?: true; 'aria-describedby'?: string } {
  return about ? { 'aria-invalid': true, 'aria-describedby': problemId } : {}
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
export function buttonClass(surface: FormSurface): string {
  return surface === 'sheet' ? 'min-h-11 w-full sm:w-auto' : 'min-h-11'
}

export function FormFrame({
  surface,
  open,
  onOpenChange,
  testId,
  title,
  description,
  onSubmitShortcut,
  footer,
  children,
  fullScreen = false,
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
  /** A long form (the bulk move): a full-height sheet, a wider dialog whose body scrolls. */
  fullScreen?: boolean
}) {
  const t = useT()
  if (surface === 'sheet') {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className={fullScreen ? 'h-dvh max-h-dvh' : 'max-h-dvh rounded-t-xl'}
          closeLabel={t('groups.common.close')}
          data-testid={testId}
          onKeyDown={submitOnCtrlEnter(onSubmitShortcut)}
        >
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          <div className={fullScreen ? 'min-h-0 flex-1 overflow-y-auto px-4' : 'min-h-0 overflow-y-auto px-4'}>
            {children}
          </div>
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
        className={fullScreen ? 'max-h-dvh overflow-y-auto sm:max-w-2xl' : undefined}
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
  const [problemField, setProblemField] = React.useState<ProblemField>(null)
  const problemId = `${ids}-problem`
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
      setProblemField('person')
      return
    }
    if (!CALENDAR_DATE.test(validFrom) || (validTo && !CALENDAR_DATE.test(validTo))) {
      setProblem(t('groups.memberships.errors.dates'))
      setProblemField('dates')
      return
    }
    setPending(true)
    setProblem(null)
    setProblemField(null)
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
          <div
            className="flex flex-col gap-1"
            role="group"
            aria-labelledby={`${ids}-person`}
            // `aria-invalid` is not allowed on a group; the message is still read with it.
            aria-describedby={problemField === 'person' ? problemId : undefined}
            data-testid="groups-membership-person"
          >
            <Label id={`${ids}-person`}>{t('groups.memberships.fields.person')}</Label>
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
              {...invalidProps(problemField === 'dates', problemId)}
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
              {...invalidProps(problemField === 'dates', problemId)}
              data-testid="groups-membership-to"
              onChange={(event) => {
                setValidTo(event.target.value)
              }}
            />
          </div>
        </div>
        <Problem id={problemId} text={problem} />
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
  const [problemField, setProblemField] = React.useState<ProblemField>(null)
  const problemId = `${ids}-problem`
  const name = personName(membership.person) || t('groups.memberships.unknownPerson')

  const submit = async () => {
    if (pending) return
    if (!CALENDAR_DATE.test(lastDay)) {
      setProblem(t('groups.memberships.errors.dates'))
      setProblemField('dates')
      return
    }
    setPending(true)
    setProblem(null)
    setProblemField(null)
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
            {...invalidProps(problemField === 'dates', problemId)}
            data-testid="groups-membership-last-day"
            onChange={(event) => {
              setLastDay(event.target.value)
            }}
          />
        </div>
        <Problem id={problemId} text={problem} />
      </div>
    </FormFrame>
  )
}

export type MoveMembershipDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `dialog` by default. */
  surface?: FormSurface
  membership: MembershipRow
  today: string
  onSaved: () => void | Promise<void>
  onRefresh: () => void
}

/**
 * "Move to another group" (spec L REQ-L11, REQ-L15 one child; #312): the target group (an active group other than
 * this one; the server keeps it within the caller's sections) and the first day there (default the 1st of the next
 * month, never in the past). The membership ends the day before; the old group's undecided declarations after it are
 * dropped and the month's fee is charged once, which the dialog says.
 */
export function MoveMembershipDialog({
  open,
  onOpenChange,
  surface = 'dialog',
  membership,
  today,
  onSaved,
  onRefresh,
}: MoveMembershipDialogProps) {
  const t = useT()
  const ids = React.useId()
  const bounds = moveDateBounds(today, membership.validFrom)
  const [toGroupId, setToGroupId] = React.useState<string | null>(null)
  const [date, setDate] = React.useState(bounds.initial)
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [problemField, setProblemField] = React.useState<'group' | 'dates' | null>(null)
  const problemId = `${ids}-problem`
  const name = personName(membership.person) || t('groups.memberships.unknownPerson')

  const fetchGroups = React.useCallback(
    async (search: string): Promise<LookupSelectItem[]> => {
      const params: Record<string, string | number | boolean> = { isActive: true, pageSize: 50, sortField: 'name' }
      if (search.trim().length >= 2) params.search = search.trim()
      const data = await fetchCrudList<GroupRow>('groups/groups', params)
      return data.items
        .filter((group) => group.id !== membership.groupId)
        .map((group) => ({ id: group.id, title: group.name ?? group.id, subtitle: group.sectionName ?? null }))
    },
    [membership.groupId],
  )

  const submit = async () => {
    if (pending) return
    if (!toGroupId) {
      setProblem(t('groups.memberships.move.groupRequired'))
      setProblemField('group')
      return
    }
    if (!CALENDAR_DATE.test(date) || date < bounds.min) {
      setProblem(t('groups.memberships.errors.dates'))
      setProblemField('dates')
      return
    }
    setPending(true)
    setProblem(null)
    setProblemField(null)
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(membership.updatedAt), () =>
        apiCallOrThrow(
          '/api/groups/memberships/move',
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ membershipId: membership.id, toGroupId, date }),
          },
          { errorMessage: t('groups.memberships.errors.move') },
        ),
      )
      onOpenChange(false)
      await onSaved()
    } catch (error: unknown) {
      if (surfaceRecordConflict(error, t, { onRefresh })) {
        onOpenChange(false)
        return
      }
      setProblem(errorMessage(error, t('groups.memberships.errors.move')))
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
        className={buttonClass(surface)}
        disabled={pending}
        data-testid="groups-membership-move-save"
        onClick={() => {
          void submit()
        }}
      >
        {t('groups.memberships.actions.move')}
      </Button>
    </>
  )
  return (
    <FormFrame
      surface={surface}
      open={open}
      onOpenChange={onOpenChange}
      testId="groups-membership-move-dialog"
      title={t('groups.memberships.move.title', { name })}
      description={t('groups.memberships.move.help')}
      onSubmitShortcut={() => void submit()}
      footer={footer}
    >
      <div className="flex flex-col gap-4">
        <div
          className="flex flex-col gap-1"
          role="group"
          aria-labelledby={`${ids}-group`}
          aria-describedby={problemField === 'group' ? problemId : undefined}
          data-testid="groups-membership-move-group"
        >
          <Label id={`${ids}-group`}>{t('groups.memberships.move.group')}</Label>
          <LookupSelect
            value={toGroupId}
            onChange={setToGroupId}
            fetchItems={fetchGroups}
            minQuery={0}
            placeholder={t('groups.memberships.move.group.placeholder')}
            searchPlaceholder={t('groups.memberships.move.group.search')}
            emptyLabel={t('groups.memberships.move.group.empty')}
            loadingLabel={t('groups.common.loading')}
            clearLabel={t('groups.common.clear')}
            selectLabel={t('groups.common.select')}
            selectedLabel={t('groups.common.selected')}
            disabled={pending}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${ids}-date`}>{t('groups.memberships.move.date')}</Label>
          <Input
            id={`${ids}-date`}
            type="date"
            className="min-h-11 sm:w-60"
            required
            min={bounds.min}
            value={date}
            disabled={pending}
            {...invalidProps(problemField === 'dates', problemId)}
            data-testid="groups-membership-move-date"
            onChange={(event) => {
              setDate(event.target.value)
            }}
          />
        </div>
        <p className="text-muted-foreground text-sm">{t('groups.memberships.move.effects')}</p>
        <Problem id={problemId} text={problem} />
      </div>
    </FormFrame>
  )
}
