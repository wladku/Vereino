'use client'
// The fields of "Add place" (club events spec REQ-T06; #377), shared by the panel's `AddExternalPlaceDialog` and the
// phone's `AddExternalPlaceSheet`: the name, the venue's address with the help "the venue's address, not a private
// one", the kind (default "Other") and the optional owner institution, then the problem line — with "Pick this place"
// when a place with the same name and address is already on the list. The state is `useAddExternalPlace`'s.
import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { EXTERNAL_PLACE_ADDRESS_MAX, EXTERNAL_PLACE_NAME_MAX, PLACE_KINDS, type PlaceKind } from '../lib/places'
import { NO_OWNER, type AddExternalPlaceState } from './useAddExternalPlace'

/** 44 px targets on the phone, the panel's default height on a desktop dialog. */
const TARGET = 'min-h-11 sm:min-h-9'

export function AddExternalPlaceFields({ state }: { state: AddExternalPlaceState }) {
  const t = useT()
  const ids = React.useId()
  const { pending, invalid, problem } = state
  const problemId = `${ids}-problem`
  const isInvalid = (field: Parameters<typeof invalid.includes>[0]) => invalid.includes(field)
  const describedBy = (field: Parameters<typeof invalid.includes>[0], help?: string) =>
    [help, isInvalid(field) && problem ? problemId : null].filter(Boolean).join(' ') || undefined

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${ids}-name`}>{t('club_core.places.fields.name')}</Label>
        <Input
          id={`${ids}-name`}
          className={TARGET}
          value={state.name}
          maxLength={EXTERNAL_PLACE_NAME_MAX}
          autoComplete="off"
          required
          disabled={pending}
          aria-invalid={isInvalid('name') || undefined}
          aria-describedby={describedBy('name', `${ids}-name-help`)}
          data-testid="add-external-place-name"
          onChange={(event) => {
            state.setName(event.target.value)
          }}
        />
        <p id={`${ids}-name-help`} className="text-muted-foreground text-xs">
          {t('club_core.externalPlace.fields.name.help')}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${ids}-address`}>{t('club_core.places.fields.address')}</Label>
        <Input
          id={`${ids}-address`}
          className={TARGET}
          value={state.address}
          maxLength={EXTERNAL_PLACE_ADDRESS_MAX}
          autoComplete="off"
          required
          disabled={pending}
          aria-invalid={isInvalid('address') || undefined}
          aria-describedby={describedBy('address', `${ids}-address-help`)}
          data-testid="add-external-place-address"
          onChange={(event) => {
            state.setAddress(event.target.value)
          }}
        />
        <p id={`${ids}-address-help`} className="text-muted-foreground text-xs">
          {t('club_core.externalPlace.fields.address.help')}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${ids}-kind`}>{t('club_core.places.fields.kind')}</Label>
        <Select
          value={state.kind}
          disabled={pending}
          onValueChange={(next: string) => {
            state.setKind(next as PlaceKind)
          }}
        >
          <SelectTrigger
            id={`${ids}-kind`}
            className={TARGET}
            aria-invalid={isInvalid('kind') || undefined}
            aria-describedby={describedBy('kind')}
            data-testid="add-external-place-kind"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PLACE_KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {t(`club_core.places.kind.${kind}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${ids}-owner`}>{t('club_core.places.fields.owner')}</Label>
        <Select value={state.ownerId} disabled={pending || state.owners.isLoading} onValueChange={state.setOwnerId}>
          <SelectTrigger
            id={`${ids}-owner`}
            className={TARGET}
            aria-invalid={isInvalid('ownerInstitutionId') || undefined}
            aria-describedby={describedBy('ownerInstitutionId', `${ids}-owner-help`)}
            data-testid="add-external-place-owner"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_OWNER}>{t('club_core.places.noOwner')}</SelectItem>
            {state.ownerOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p id={`${ids}-owner-help`} className="text-muted-foreground text-xs">
          {state.owners.isLoading
            ? t('club_core.picker.loading')
            : state.owners.isError
              ? t('club_core.picker.loadError')
              : t('club_core.externalPlace.fields.owner.help')}
        </p>
        {state.owners.isError ? (
          <Button
            type="button"
            variant="outline"
            className={`${TARGET} self-start`}
            onClick={() => void state.owners.refetch()}
          >
            {t('club_core.picker.retry')}
          </Button>
        ) : null}
      </div>
      {problem ? (
        <div className="flex flex-col items-start gap-2" data-testid="add-external-place-problem">
          <p id={problemId} className="text-destructive text-sm" role="alert">
            {problem}
          </p>
          {state.canPickExisting ? (
            <Button
              type="button"
              variant="outline"
              className={TARGET}
              data-testid="add-external-place-pick-existing"
              onClick={() => void state.pickExisting()}
            >
              {t('club_core.externalPlace.pickExisting')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
