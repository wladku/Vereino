'use client'
// `/backend/club/contracts/create` and `/backend/club/contracts/[id]/edit` (club spec UI table; README B-07; #96): a
// contract with a person or an institution for a period. A coach contract is always with a person and carries the
// rates of the club's current settlement model (entered in złoty, sent in grosz); the party and the kind are fixed once
// the contract exists.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { ErrorMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { ComboboxInput, type ComboboxOption } from '@open-mercato/ui/backend/inputs'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { createCrud, deleteCrud, fetchCrudList, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { withFlash } from '@open-mercato/ui/backend/utils/flash'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { dateField } from '@vereino/ui'
import {
  COACH_TERMS_BY_MODEL,
  CONTRACT_KINDS,
  CONTRACT_PARTY_TYPES,
  type CoachSettlementModel,
  type CoachTermField,
} from '../lib/contracts'
import { enumOptions, errorMessage, textOrNull, type Translate } from './client-helpers'
import { groszToZloty, zlotyToGrosz, type ContractRow } from './contracts-shared'

const LIST_HREF = '/backend/club/contracts'
const ENTITY_ID = 'club_core:contract'
const RATES_GROUP = 'rates'

type ContractFormValues = Record<string, unknown> & { updatedAt?: string | null }

type SettingsResponse = { coachSettlementModel: CoachSettlementModel }

type PersonRow = { id: string; firstName: string | null; lastName: string | null }
type InstitutionOptionRow = { id: string; name: string | null }

/** The club's current coach settlement model (`GET /api/club_core/settings`). */
function useSettlementModel() {
  return useQuery({
    queryKey: ['club_core-settings'],
    queryFn: () => readApiResultOrThrow<SettingsResponse>('/api/club_core/settings'),
    select: (settings) => settings.coachSettlementModel,
  })
}

function personLabel(person: PersonRow): string {
  return [person.firstName, person.lastName].filter(Boolean).join(' ') || person.id
}

async function personOptions(query?: string): Promise<ComboboxOption[]> {
  const params = new URLSearchParams({ pageSize: '20' })
  if (query?.trim()) params.set('search', query.trim())
  const data = await readApiResultOrThrow<{ items?: PersonRow[] }>(`/api/people/persons?${params.toString()}`)
  return (data.items ?? []).map((person) => ({ value: person.id, label: personLabel(person) }))
}

type KindSelectProps = {
  id: string
  value: unknown
  disabled?: boolean
  setValue: (value: unknown) => void
  setFormValue?: (id: string, value: unknown) => void
  onKindChange: (kind: string) => void
  t: Translate
}

/** The contract kind; a coach contract is with a person, so choosing it fixes the party type. */
function ContractKindSelect({ id, value, disabled, setValue, setFormValue, onKindChange, t }: KindSelectProps) {
  const current = typeof value === 'string' ? value : ''
  return (
    <Select
      value={current}
      onValueChange={(next) => {
        setValue(next)
        const isCoach = next === 'coach'
        setFormValue?.('isCoach', isCoach)
        if (isCoach) setFormValue?.('partyType', 'person')
        onKindChange(next)
      }}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-label={t('club_core.contracts.fields.kind')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CONTRACT_KINDS.map((kind) => (
          <SelectItem key={kind} value={kind}>
            {t(`club_core.contracts.kind.${kind}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

type PartyPickerProps = {
  id: string
  value: unknown
  disabled?: boolean
  values?: Record<string, unknown>
  setValue: (value: unknown) => void
  t: Translate
}

/** A person (searched as you type) or an institution of the club, per the chosen party type. */
function PartyPicker({ id, value, disabled, values, setValue, t }: PartyPickerProps) {
  const partyType = values?.partyType === 'institution' ? 'institution' : 'person'
  const current = typeof value === 'string' ? value : ''
  const previousType = React.useRef(partyType)
  React.useEffect(() => {
    if (previousType.current === partyType) return
    previousType.current = partyType
    setValue('')
  }, [partyType, setValue])
  const institutions = useQuery({
    queryKey: ['club_core-contracts-institution-options'],
    queryFn: async () => {
      const data = await fetchCrudList<InstitutionOptionRow>('club_core/institutions', {
        pageSize: 100,
        sortField: 'name',
        sortDir: 'asc',
      })
      return data.items.map((row) => ({ value: row.id, label: row.name ?? row.id }))
    },
    enabled: partyType === 'institution',
  })

  if (partyType === 'person') {
    return (
      <ComboboxInput
        value={current}
        onChange={(next) => {
          setValue(next)
        }}
        placeholder={t('club_core.contracts.fields.person.placeholder')}
        loadSuggestions={personOptions}
        allowCustomValues={false}
        clearable={false}
        disabled={disabled}
      />
    )
  }
  return (
    <Select
      value={current}
      onValueChange={(next) => {
        setValue(next)
      }}
      disabled={disabled || institutions.isLoading}
    >
      <SelectTrigger id={id} aria-label={t('club_core.contracts.fields.institution')}>
        <SelectValue placeholder={t('club_core.contracts.fields.institution.placeholder')} />
      </SelectTrigger>
      <SelectContent>
        {(institutions.data ?? []).map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function rateFields(model: CoachSettlementModel, t: Translate): CrudField[] {
  return COACH_TERMS_BY_MODEL[model].map((field) => ({
    id: field,
    label: t(`club_core.contracts.fields.${field}`),
    type: 'text',
    required: true,
    layout: 'half',
    placeholder: t('club_core.contracts.fields.rate.placeholder'),
  }))
}

function ratesGroup(model: CoachSettlementModel, t: Translate): CrudFormGroup {
  return {
    id: RATES_GROUP,
    title: t('club_core.contracts.groups.rates'),
    description: t('club_core.contracts.groups.rates.help', {
      model: t(`club_core.settings.coachSettlementModel.${model}`),
    }),
    column: 2,
    fields: [...COACH_TERMS_BY_MODEL[model]],
  }
}

function periodFields(t: Translate): CrudField[] {
  return [
    dateField('validFrom', t('club_core.contracts.fields.validFrom'), { required: true, layout: 'half' }),
    dateField('validTo', t('club_core.contracts.fields.validTo'), {
      layout: 'half',
      description: t('club_core.contracts.fields.validTo.help'),
    }),
  ]
}

/**
 * The model's rates in grosz; a rate that is not an amount stops the save next to its field. Null for a contract
 * that is not a coach's (it stores no terms).
 */
function termsPayload(
  values: ContractFormValues,
  kind: unknown,
  model: CoachSettlementModel,
  t: Translate,
): Record<string, number> | null {
  if (kind !== 'coach') return null
  const terms: Record<string, number> = {}
  const fieldErrors: Record<string, string> = {}
  for (const field of COACH_TERMS_BY_MODEL[model]) {
    const grosz = zlotyToGrosz(values[field])
    if (grosz === null) fieldErrors[field] = t('club_core.contracts.errors.rate')
    else terms[field] = grosz
  }
  if (Object.keys(fieldErrors).length > 0) {
    throw createCrudFormError(t('club_core.contracts.errors.rates'), fieldErrors)
  }
  return terms
}

function periodPayload(values: ContractFormValues) {
  return { validFrom: textOrNull(values.validFrom), validTo: textOrNull(values.validTo) }
}

function rateValues(row: ContractRow | null): Record<CoachTermField, string> {
  const terms = row?.terms ?? {}
  return {
    baseMonthly: groszToZloty(terms.baseMonthly),
    unitRate: groszToZloty(terms.unitRate),
    matchRate: groszToZloty(terms.matchRate),
    travelRate: groszToZloty(terms.travelRate),
    sessionAmount: groszToZloty(terms.sessionAmount),
    tripAmount: groszToZloty(terms.tripAmount),
  }
}

export function ContractCreateForm() {
  const t = useT()
  const model = useSettlementModel()
  const [kind, setKind] = React.useState<string>('coach')
  const fields = React.useMemo<CrudField[]>(
    () => [
      {
        id: 'kind',
        label: t('club_core.contracts.fields.kind'),
        type: 'custom',
        required: true,
        component: ({ id, value, disabled, setValue, setFormValue }) => (
          <ContractKindSelect
            id={id}
            value={value}
            disabled={disabled}
            setValue={setValue}
            setFormValue={setFormValue}
            onKindChange={setKind}
            t={t}
          />
        ),
      },
      {
        id: 'partyType',
        label: t('club_core.contracts.fields.partyType'),
        type: 'select',
        options: enumOptions(CONTRACT_PARTY_TYPES, 'club_core.contracts.partyType', t),
        required: true,
        visibleWhen: { field: 'isCoach', equals: false },
      },
      {
        id: 'partyId',
        label: t('club_core.contracts.fields.party'),
        type: 'custom',
        required: true,
        description: t('club_core.contracts.fields.party.help'),
        component: ({ id, value, disabled, values, setValue }) => (
          <PartyPicker id={id} value={value} disabled={disabled} values={values} setValue={setValue} t={t} />
        ),
      },
      ...periodFields(t),
      ...(model.data ? rateFields(model.data, t) : []),
    ],
    [t, model.data],
  )
  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      {
        id: 'contract',
        title: t('club_core.contracts.groups.contract'),
        column: 1,
        fields: ['kind', 'partyType', 'partyId', 'validFrom', 'validTo'],
      },
      ...(model.data ? [ratesGroup(model.data, t)] : []),
    ],
    [t, model.data],
  )

  if (model.error) return <ErrorMessage label={errorMessage(model.error, t('club_core.contracts.errors.settings'))} />

  return (
    <CrudForm<ContractFormValues>
      title={t('club_core.contracts.create.title')}
      titleHeadingLevel={1}
      backHref={LIST_HREF}
      cancelHref={LIST_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      hiddenGroupIds={kind === 'coach' ? [] : [RATES_GROUP]}
      isLoading={model.isLoading}
      loadingMessage={t('club_core.common.loading')}
      initialValues={{
        kind: 'coach',
        isCoach: true,
        partyType: 'person',
        partyId: '',
        validFrom: '',
        validTo: '',
        ...rateValues(null),
      }}
      submitLabel={t('club_core.common.create')}
      successRedirect={withFlash(LIST_HREF, t('club_core.contracts.flash.created'), 'success')}
      onSubmit={async (values) => {
        if (!model.data) return
        const terms = termsPayload(values, values.kind, model.data, t)
        await createCrud('club_core/contracts', {
          kind: values.kind,
          partyType: values.kind === 'coach' ? 'person' : values.partyType,
          partyId: textOrNull(values.partyId),
          ...periodPayload(values),
          ...(terms ? { terms } : {}),
        })
      }}
    />
  )
}

export function ContractEditForm({ id }: { id: string }) {
  const t = useT()
  const model = useSettlementModel()
  const query = useQuery({
    queryKey: ['club_core-contracts-record', id],
    queryFn: async () => {
      const data = await fetchCrudList<ContractRow>('club_core/contracts', { ids: id, pageSize: 1 })
      return data.items[0] ?? null
    },
  })
  const row = query.data ?? null
  const isCoach = row?.kind === 'coach'

  const fields = React.useMemo<CrudField[]>(
    () => [
      { id: 'kindLabel', label: t('club_core.contracts.fields.kind'), type: 'text', disabled: true },
      {
        id: 'partyLabel',
        label: t('club_core.contracts.fields.party'),
        type: 'text',
        disabled: true,
        description: t('club_core.contracts.fields.party.fixed'),
      },
      ...periodFields(t),
      ...(model.data ? rateFields(model.data, t) : []),
    ],
    [t, model.data],
  )
  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      {
        id: 'contract',
        title: t('club_core.contracts.groups.contract'),
        column: 1,
        fields: ['kindLabel', 'partyLabel', 'validFrom', 'validTo'],
      },
      ...(model.data ? [ratesGroup(model.data, t)] : []),
    ],
    [t, model.data],
  )

  if (query.isSuccess && !row) {
    return (
      <RecordNotFoundState
        label={t('club_core.contracts.errors.notFound')}
        backHref={LIST_HREF}
        backLabel={t('club_core.contracts.actions.back')}
      />
    )
  }
  if (query.error) return <ErrorMessage label={errorMessage(query.error, t('club_core.contracts.errors.load'))} />
  if (model.error) return <ErrorMessage label={errorMessage(model.error, t('club_core.contracts.errors.settings'))} />

  return (
    <CrudForm<ContractFormValues>
      key={row ? (row.updatedAt ?? row.id) : 'loading'}
      title={t('club_core.contracts.edit.title')}
      titleHeadingLevel={1}
      backHref={LIST_HREF}
      cancelHref={LIST_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      hiddenGroupIds={isCoach ? [] : [RATES_GROUP]}
      isLoading={query.isLoading || model.isLoading}
      loadingMessage={t('club_core.contracts.loading')}
      initialValues={{
        id,
        kindLabel: row?.kind ? t(`club_core.contracts.kind.${row.kind}`) : '',
        partyLabel: row?.partyName ?? t('club_core.contracts.deletedParty'),
        validFrom: row?.validFrom ?? '',
        validTo: row?.validTo ?? '',
        ...rateValues(row),
        updatedAt: row?.updatedAt ?? null,
      }}
      submitLabel={t('club_core.common.save')}
      successRedirect={withFlash(LIST_HREF, t('club_core.contracts.flash.saved'), 'success')}
      deleteRedirect={withFlash(LIST_HREF, t('club_core.contracts.flash.deleted'), 'success')}
      onSubmit={async (values) => {
        if (!model.data) return
        const terms = termsPayload(values, row?.kind, model.data, t)
        await updateCrud('club_core/contracts', { id, ...periodPayload(values), terms })
      }}
      onDelete={async () => {
        await deleteCrud('club_core/contracts', id)
      }}
    />
  )
}
