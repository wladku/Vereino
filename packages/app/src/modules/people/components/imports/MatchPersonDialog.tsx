'use client'
// The "match to an existing person" choice of the import's review queue (#28): the administrator searches the club's
// people by last name (the platform's search tokens over the encrypted column) and picks the person the row stands
// for. The row's own name is only shown as a hint — nothing is matched by name automatically (DD-38).
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
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
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { personName, type PersonListRow } from '../client-helpers'
import { valuesName, type ImportRowRow, type Paged } from './import-client'

export function MatchPersonDialog({
  row,
  onClose,
  onChoose,
}: {
  row: ImportRowRow
  onClose: () => void
  onChoose: (personId: string) => Promise<void>
}) {
  const t = useT()
  const inputId = React.useId()
  const participant = row.values?.persons.participant
  const [search, setSearch] = React.useState(participant?.lastName ?? '')
  const lastName = search.trim()
  const { data, isFetching, error } = useQuery({
    queryKey: ['people-import-match', lastName],
    enabled: lastName.length > 0,
    queryFn: async () => {
      const params = new URLSearchParams({ lastName, pageSize: '10', page: '1' })
      const call = await apiCall<Paged<PersonListRow>>(`/api/people/persons?${params}`)
      if (!call.ok || !call.result) throw new Error(t('people.imports.errors.search'))
      return call.result.items
    },
  })

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent closeAriaLabel={t('people.imports.match.close')} data-testid="people-import-match-dialog">
        <DialogHeader>
          <DialogTitle>{t('people.imports.match.title', { row: row.rowNo })}</DialogTitle>
          <DialogDescription>
            {t('people.imports.match.help', { name: valuesName(participant) || t('people.common.empty') })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor={inputId}>{t('people.imports.match.search')}</Label>
          <Input
            id={inputId}
            value={search}
            data-testid="people-import-match-search"
            onChange={(event) => {
              setSearch(event.target.value)
            }}
          />
        </div>
        <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto" aria-live="polite">
          {lastName.length === 0 ? (
            <li className="text-muted-foreground text-sm">{t('people.imports.match.typeToSearch')}</li>
          ) : isFetching && !data ? (
            <li className="text-muted-foreground text-sm">{t('people.imports.match.searching')}</li>
          ) : error ? (
            <li className="text-destructive text-sm">{t('people.imports.errors.search')}</li>
          ) : (data ?? []).length === 0 ? (
            <li className="text-muted-foreground text-sm">{t('people.imports.match.none')}</li>
          ) : (
            (data ?? []).map((person) => (
              <li key={person.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                <span className="flex min-w-0 flex-col">
                  <span className="break-words">{personName(person) || t('people.common.empty')}</span>
                  {person.birthDate ? <span className="text-muted-foreground text-xs">{person.birthDate}</span> : null}
                </span>
                <Button
                  type="button"
                  size="sm"
                  data-testid={`people-import-match-choose-${person.id}`}
                  onClick={() => void onChoose(person.id)}
                >
                  {t('people.imports.match.choose')}
                </Button>
              </li>
            ))
          )}
        </ul>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('people.imports.match.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
