'use client'
// The body of the coach picker (README B-15; E06-S13 #95), shared by the panel's `AssignCoachDialog` and the phone's
// `AssignCoachSheet` (E10-S08 #273): an optional search (the sheet's), the coaches as a radio list — the free ones
// first, a busy one disabled with "Busy: {session}" — the optional reason and the problem line. The state and the save
// are `useAssignCoach`'s.
import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { RadioGroup } from '@open-mercato/ui/primitives/radio'
import { RadioField } from '@open-mercato/ui/primitives/radio-field'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { SUBSTITUTION_REASON_MAX } from '../lib/substitutions'
import { instantTime } from './client-helpers'
import type { useAssignCoach } from './useAssignCoach'

export function CoachPickerFields({
  picker,
  searchable = false,
  listClassName = 'max-h-72',
}: {
  picker: ReturnType<typeof useAssignCoach>
  /** The phone's sheet offers a search over the names. */
  searchable?: boolean
  listClassName?: string
}) {
  const t = useT()
  const reasonId = React.useId()
  const searchId = React.useId()
  const problemId = React.useId()
  const { options, items, pending, problem } = picker

  let list: React.ReactNode
  if (options.isLoading) list = <p className="text-muted-foreground text-sm">{t('activities.substitutions.loading')}</p>
  else if (options.isError) {
    list = (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm">{t('activities.substitutions.errors.load')}</p>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => void options.refetch()}>
          {t('activities.club.actions.retry')}
        </Button>
      </div>
    )
  } else if (items.length === 0) {
    list = (
      <p className="text-muted-foreground text-sm" data-testid="assign-coach-empty">
        {t(picker.search.trim() ? 'activities.substitutions.noMatch' : 'activities.substitutions.empty')}
      </p>
    )
  } else {
    list = (
      <RadioGroup
        value={picker.coachId}
        aria-label={t('activities.substitutions.coach')}
        aria-describedby={problem ? problemId : undefined}
        className={`flex flex-col gap-3 overflow-y-auto ${listClassName}`}
        onValueChange={picker.choose}
      >
        {items.map((item) => (
          <RadioField
            key={item.id}
            value={item.id}
            disabled={pending || item.busy !== null}
            data-testid="assign-coach-option"
            data-busy={item.busy ? 'true' : 'false'}
            label={item.name}
            description={
              item.busy
                ? t('activities.substitutions.busy', {
                    session: [item.busy.activityName, instantTime(item.busy.startAt)].filter(Boolean).join(' '),
                  })
                : t('activities.substitutions.free')
            }
          />
        ))}
      </RadioGroup>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {searchable ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={searchId}>{t('activities.substitutions.search')}</Label>
          <Input
            id={searchId}
            type="search"
            data-testid="assign-coach-search"
            className="min-h-11"
            value={picker.search}
            disabled={pending}
            onChange={(event) => {
              picker.setSearch(event.target.value)
            }}
          />
        </div>
      ) : null}
      {list}
      <div className="flex flex-col gap-2">
        <Label htmlFor={reasonId}>{t('activities.substitutions.reason')}</Label>
        <Input
          id={reasonId}
          data-testid="assign-coach-reason"
          maxLength={SUBSTITUTION_REASON_MAX}
          value={picker.reason}
          disabled={pending}
          onChange={(event) => {
            picker.setReason(event.target.value)
          }}
        />
      </div>
      {problem ? (
        <p id={problemId} className="text-destructive text-sm" role="alert" data-testid="assign-coach-problem">
          {problem}
        </p>
      ) : null}
    </div>
  )
}
