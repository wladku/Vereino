'use client'
// The pieces of the club event forms that the panel (CrudForm) and the phone pages (#380) share, kept apart from the
// panel's form files so a phone page does not load `@open-mercato/ui/backend/CrudForm` (#440): the spot of the
// "Add place" dialog and the visiting teams field of a part.
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createCrud, fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { Button } from '@open-mercato/ui/primitives/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { InlineCreateDialog } from '@vereino/ui'
import { MAX_VISITING_TEAMS } from '../lib/club-events'
import { errorMessage, type Translate } from './client-helpers'

/** The spot `club_core` draws its "Add place" dialog on. */
export const CLUB_EVENT_ADD_PLACE_SPOT_ID = 'vereino:activities:club-event-form:add-place'

type TeamOption = { value: string; label: string }

const EXTERNAL_TEAMS_QUERY_KEY = ['activities-club-event-external-teams']

function useExternalTeams() {
  return useQuery({
    queryKey: EXTERNAL_TEAMS_QUERY_KEY,
    queryFn: async (): Promise<TeamOption[]> => {
      const data = await fetchCrudList<{ id: string; name: string | null; clubName: string | null }>(
        'groups/external-teams',
        { pageSize: 100, sortField: 'name', sortDir: 'asc' },
      )
      return data.items.map((item) => ({
        value: item.id,
        label: item.clubName ? `${item.name ?? item.id} (${item.clubName})` : (item.name ?? item.id),
      }))
    },
  })
}

/** The visiting teams as chips, a picker of the remaining teams and **Add team**. */
export function VisitingTeamsField({
  id,
  value,
  disabled,
  setValue,
  t,
}: {
  id: string
  value: unknown
  disabled?: boolean
  setValue: (value: unknown) => void
  t: Translate
}) {
  const queryClient = useQueryClient()
  const teams = useExternalTeams()
  const [adding, setAdding] = React.useState(false)
  const addRef = React.useRef<HTMLButtonElement | null>(null)
  const selected = Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
  const options = teams.data ?? []
  const labelOf = (teamId: string) => options.find((option) => option.value === teamId)?.label ?? teamId
  const remaining = options.filter((option) => !selected.includes(option.value))
  const full = selected.length >= MAX_VISITING_TEAMS
  return (
    <div className="flex flex-col gap-2">
      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label={t('activities.clubEvents.part.fields.teams')}>
          {selected.map((teamId) => (
            <li
              key={teamId}
              className="bg-muted flex items-center gap-1 rounded-full py-0.5 pr-1 pl-3 text-sm"
              data-testid="club-event-part-team"
            >
              <span>{labelOf(teamId)}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                aria-label={t('activities.clubEvents.part.teams.remove', { name: labelOf(teamId) })}
                onClick={() => {
                  setValue(selected.filter((entry) => entry !== teamId))
                }}
              >
                ×
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t('activities.clubEvents.part.teams.none')}</p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select
          value=""
          disabled={disabled || full || remaining.length === 0}
          onValueChange={(next: string) => {
            if (next) setValue([...selected, next])
          }}
        >
          <SelectTrigger id={id} className="min-w-0 sm:flex-1" data-testid="club-event-part-team-picker">
            <SelectValue placeholder={t('activities.clubEvents.part.teams.pick')} />
          </SelectTrigger>
          <SelectContent>
            {remaining.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          ref={addRef}
          type="button"
          variant="outline"
          disabled={disabled || full}
          data-testid="club-event-part-add-team"
          onClick={() => {
            setAdding(true)
          }}
        >
          {t('activities.clubEvents.part.teams.add')}
        </Button>
      </div>
      <InlineCreateDialog
        id="club-event-part-team-create"
        open={adding}
        onOpenChange={setAdding}
        title={t('activities.clubEvents.part.teams.createTitle')}
        description={t('activities.clubEvents.part.teams.createHelp')}
        fields={[
          {
            id: 'name',
            label: t('activities.clubEvents.part.teams.name'),
            type: 'text',
            required: true,
            maxLength: 200,
          },
          { id: 'clubName', label: t('activities.clubEvents.part.teams.clubName'), type: 'text', maxLength: 200 },
          { id: 'contact', label: t('activities.clubEvents.part.teams.contact'), type: 'text', maxLength: 1000 },
        ]}
        labels={{
          submit: t('activities.clubEvents.part.teams.submit'),
          saving: t('activities.clubEvents.part.teams.saving'),
          cancel: t('activities.common.cancel'),
          close: t('activities.common.close'),
          required: t('activities.form.errors.required'),
        }}
        returnFocusRef={addRef}
        onCreate={async (values) => {
          const call = await createCrud<{ id?: string }>('groups/external-teams', values, {
            errorMessage: t('activities.clubEvents.part.teams.createFailed'),
          })
          const teamId = call.result?.id
          if (!teamId) throw new Error(t('activities.clubEvents.part.teams.createFailed'))
          const label = values.clubName ? `${values.name} (${values.clubName})` : values.name
          return { value: teamId, label }
        }}
        onCreated={(option) => {
          queryClient.setQueryData<TeamOption[]>(EXTERNAL_TEAMS_QUERY_KEY, (current) => [
            ...(current ?? []).filter((entry) => entry.value !== option.value),
            { value: option.value, label: option.label },
          ])
          setValue([...selected.filter((entry) => entry !== option.value), option.value])
          void queryClient.invalidateQueries({ queryKey: EXTERNAL_TEAMS_QUERY_KEY })
        }}
        describeError={(error) => ({
          message: errorMessage(error, t('activities.clubEvents.part.teams.createFailed')),
        })}
        testId="club-event-part-team-create"
      />
    </div>
  )
}
