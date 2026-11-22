'use client'
// `/backend/club/settings` (club spec UI table, DD-37): the club settings with their defaults, edited in one
// `CrudForm`; the lock token comes from `initialValues.updatedAt` (null until the first save creates the row). Since
// #29 the club logo panel sits under the form (upload, replace, remove; REQ-028). Since #87 the club name (the platform
// organization's) is edited here and the time zone is picked from the runtime's IANA zones. Since #199 it holds
// `coach_may_cancel`, whether a coach may cancel a session; since #111 the club's bank account for the payers' transfer
// instructions. Since #309 (people life-cycle spec B-02, REQ-L10, DD-L11) the group "Consent texts" holds one textarea
// per consent key (at most 1000 characters; empty restores the built-in text, shown as the placeholder) with the date it
// was last changed; a consent given before a change stays valid and reads "given to an earlier wording". Since #471
// (club spec REQ-041) the group "Data retention" holds the months after which a former participant is anonymised.
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCallOrThrow, readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { createCrudFormError, normalizeCrudServerError } from '@open-mercato/ui/backend/utils/serverErrors'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { formatBankAccount } from '@vereino/core'
import {
  ACTIVITY_TYPES,
  AVAILABLE_ORDER_SALES_DOCUMENTS,
  CALLED_UP_CHILDREN_VISIBILITY,
  COACH_SETTLEMENT_MODELS,
  DECLARATION_KINDS,
  FORMER_PARTICIPANT_RETENTION_MONTHS_RANGE,
  ONLINE_FEE_MODES,
  OWN_ACCOUNT_MIN_AGE_RANGE,
  timeZoneOptions,
  type ClubSettingsValues,
} from '../lib/settings'
import {
  CONSENT_TEXT_KEYS,
  CONSENT_TEXT_MAX_LENGTH,
  type ConsentTextKey,
  type ConsentTexts,
} from '../lib/consent-texts'
import { nameInitial } from '../lib/files'
import { enumOptions, errorMessage, numberOrNull, textOrNull } from './client-helpers'
import { LogoPanel } from './LogoPanel'

const SETTINGS_API = '/api/club_core/settings'
const LOCALES = ['pl', 'en'] as const

type SettingsResponse = ClubSettingsValues & {
  clubName: string | null
  bankAccount: string | null
  logoAttachmentId: string | null
  logoUrl: string | null
  consentTexts?: ConsentTexts
  updatedAt: string | null
}

type FormValues = Record<string, unknown> & { updatedAt: string | null }

const kindField = (type: string) => `declarationKind_${type}`
const consentTextField = (key: ConsentTextKey) => `consentText_${key}`

/** The API names a too-long text `consentTexts.<key>`; the form's field is `consentText_<key>`. */
function remapConsentTextErrors(error: unknown, fallback: string): unknown {
  const normalized = normalizeCrudServerError(error)
  const fieldErrors = normalized.fieldErrors
  if (!fieldErrors) return error
  const mapped = Object.fromEntries(
    Object.entries(fieldErrors).map(([field, message]) => [
      field.startsWith('consentTexts.')
        ? consentTextField(field.slice('consentTexts.'.length) as ConsentTextKey)
        : field,
      message,
    ]),
  )
  return createCrudFormError(normalized.message ?? fallback, mapped, { status: normalized.status })
}

/** The IANA zones this browser knows; empty where `Intl.supportedValuesOf` is missing (the stored zone stays listed). */
function supportedTimeZones(): string[] {
  return typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
}

function toFormValues(settings: SettingsResponse): FormValues {
  const values: FormValues = {
    clubName: settings.clubName ?? '',
    shortName: settings.shortName ?? '',
    defaultLocale: settings.defaultLocale,
    timezone: settings.timezone,
    currency: settings.currency,
    ownAccountMinAge: settings.ownAccountMinAge,
    onlineFeeMode: settings.onlineFeeMode,
    onlineFeePercent: settings.onlineFeePercent,
    // Shown in major units (e.g. 1.00 PLN); stored in minor units.
    onlineFeeFixed: settings.onlineFeeFixed / 100,
    coachSettlementModel: settings.coachSettlementModel,
    showCalledUpChildren: settings.showCalledUpChildren,
    coachMayCancel: settings.coachMayCancel,
    orderSalesDocument: settings.orderSalesDocument,
    formerParticipantRetentionMonths: settings.formerParticipantRetentionMonths,
    bankAccount: settings.bankAccount ? formatBankAccount(settings.bankAccount) : '',
    updatedAt: settings.updatedAt,
  }
  for (const type of ACTIVITY_TYPES) values[kindField(type)] = settings.declarationKinds[type]
  for (const key of CONSENT_TEXT_KEYS) values[consentTextField(key)] = settings.consentTexts?.[key]?.text ?? ''
  return values
}

function toPayload(values: Record<string, unknown>) {
  const declarationKinds = Object.fromEntries(ACTIVITY_TYPES.map((type) => [type, values[kindField(type)]]))
  const fixed = numberOrNull(values.onlineFeeFixed)
  const clubName = textOrNull(values.clubName)
  return {
    ...(clubName ? { clubName } : {}),
    shortName: textOrNull(values.shortName),
    defaultLocale: values.defaultLocale,
    timezone: textOrNull(values.timezone) ?? undefined,
    currency: textOrNull(values.currency)?.toUpperCase() ?? undefined,
    ownAccountMinAge: numberOrNull(values.ownAccountMinAge) ?? undefined,
    declarationKinds,
    onlineFeeMode: values.onlineFeeMode,
    onlineFeePercent: numberOrNull(values.onlineFeePercent) ?? 0,
    onlineFeeFixed: fixed === null ? 0 : Math.round(fixed * 100),
    coachSettlementModel: values.coachSettlementModel,
    showCalledUpChildren: values.showCalledUpChildren,
    coachMayCancel: values.coachMayCancel === true,
    orderSalesDocument: values.orderSalesDocument,
    formerParticipantRetentionMonths: numberOrNull(values.formerParticipantRetentionMonths) ?? undefined,
    bankAccount: textOrNull(values.bankAccount),
    // An empty text restores the built-in one; an unchanged text keeps its "last changed" date (DD-L11).
    consentTexts: Object.fromEntries(
      CONSENT_TEXT_KEYS.map((key) => {
        const value = values[consentTextField(key)]
        return [key, typeof value === 'string' ? value : '']
      }),
    ),
  }
}

export function ClubSettingsForm() {
  const t = useT()
  const locale = useLocale()
  const queryClient = useQueryClient()
  const { data: settings, error } = useQuery({
    queryKey: ['club_core-settings'],
    queryFn: () => readApiResultOrThrow<SettingsResponse>(SETTINGS_API),
  })

  const currentTimeZone = settings?.timezone ?? null
  const consentTexts = settings?.consentTexts
  const fields = React.useMemo<CrudField[]>(() => {
    const kindOptions = enumOptions(DECLARATION_KINDS, 'club_core.settings.declarationKind', t)
    const zones = timeZoneOptions(supportedTimeZones(), currentTimeZone).map((zone) => ({ value: zone, label: zone }))
    return [
      {
        id: 'clubName',
        label: t('club_core.settings.fields.clubName'),
        type: 'text',
        maxLength: 200,
        description: t('club_core.settings.fields.clubName.description'),
        required: true,
      },
      { id: 'shortName', label: t('club_core.settings.fields.shortName'), type: 'text', maxLength: 100 },
      {
        id: 'defaultLocale',
        label: t('club_core.settings.fields.defaultLocale'),
        type: 'select',
        options: enumOptions(LOCALES, 'club_core.settings.locale', t),
        required: true,
      },
      {
        id: 'timezone',
        label: t('club_core.settings.fields.timezone'),
        type: 'select',
        options: zones,
        description: t('club_core.settings.fields.timezone.description'),
        required: true,
      },
      {
        id: 'currency',
        label: t('club_core.settings.fields.currency'),
        type: 'text',
        maxLength: 3,
        description: t('club_core.settings.fields.currency.description'),
        required: true,
      },
      {
        id: 'ownAccountMinAge',
        label: t('club_core.settings.fields.ownAccountMinAge'),
        type: 'number',
        description: t('club_core.settings.fields.ownAccountMinAge.description', OWN_ACCOUNT_MIN_AGE_RANGE),
        required: true,
      },
      {
        id: 'formerParticipantRetentionMonths',
        label: t('club_core.settings.fields.formerParticipantRetentionMonths'),
        type: 'number',
        description: t(
          'club_core.settings.fields.formerParticipantRetentionMonths.description',
          FORMER_PARTICIPANT_RETENTION_MONTHS_RANGE,
        ),
        required: true,
      },
      ...ACTIVITY_TYPES.map<CrudField>((type) => ({
        id: kindField(type),
        label: t(`club_core.settings.activityType.${type}`),
        type: 'select',
        options: kindOptions,
        required: true,
      })),
      {
        id: 'onlineFeeMode',
        label: t('club_core.settings.fields.onlineFeeMode'),
        type: 'select',
        options: enumOptions(ONLINE_FEE_MODES, 'club_core.settings.onlineFeeMode', t),
        required: true,
      },
      {
        id: 'onlineFeePercent',
        label: t('club_core.settings.fields.onlineFeePercent'),
        type: 'number',
        description: t('club_core.settings.fields.onlineFeePercent.description'),
      },
      {
        id: 'onlineFeeFixed',
        label: t('club_core.settings.fields.onlineFeeFixed'),
        type: 'number',
        description: t('club_core.settings.fields.onlineFeeFixed.description'),
      },
      {
        id: 'orderSalesDocument',
        label: t('club_core.settings.fields.orderSalesDocument'),
        type: 'select',
        options: enumOptions(AVAILABLE_ORDER_SALES_DOCUMENTS, 'club_core.settings.orderSalesDocument', t),
        description: t('club_core.settings.fields.orderSalesDocument.description'),
        required: true,
      },
      {
        id: 'bankAccount',
        label: t('club_core.settings.fields.bankAccount'),
        type: 'text',
        maxLength: 64,
        description: t('club_core.settings.fields.bankAccount.description'),
      },
      {
        id: 'coachSettlementModel',
        label: t('club_core.settings.fields.coachSettlementModel'),
        type: 'select',
        options: enumOptions(COACH_SETTLEMENT_MODELS, 'club_core.settings.coachSettlementModel', t),
        required: true,
      },
      {
        id: 'showCalledUpChildren',
        label: t('club_core.settings.fields.showCalledUpChildren'),
        type: 'select',
        options: enumOptions(CALLED_UP_CHILDREN_VISIBILITY, 'club_core.settings.showCalledUpChildren', t),
        required: true,
      },
      {
        id: 'coachMayCancel',
        label: t('club_core.settings.fields.coachMayCancel'),
        type: 'checkbox',
        description: t('club_core.settings.fields.coachMayCancel.description'),
      },
      ...CONSENT_TEXT_KEYS.map<CrudField>((key) => {
        const changedAt = consentTexts?.[key]?.changedAt
        const date = changedAt
          ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(changedAt))
          : null
        return {
          id: consentTextField(key),
          label: t(`club_core.settings.consentTexts.${key}`),
          type: 'textarea',
          rows: 3,
          maxLength: CONSENT_TEXT_MAX_LENGTH,
          showCount: true,
          placeholder: t(`club_core.settings.consentTexts.${key}.builtIn`),
          description: date
            ? t('club_core.settings.consentTexts.lastChanged', { date })
            : t('club_core.settings.consentTexts.builtInInUse'),
        }
      }),
    ]
  }, [t, currentTimeZone, consentTexts, locale])

  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      {
        id: 'club',
        title: t('club_core.settings.groups.club'),
        column: 1,
        fields: ['clubName', 'shortName', 'defaultLocale', 'timezone', 'currency', 'ownAccountMinAge'],
      },
      {
        id: 'declarations',
        title: t('club_core.settings.groups.declarations'),
        description: t('club_core.settings.groups.declarations.description'),
        column: 2,
        fields: ACTIVITY_TYPES.map(kindField),
      },
      {
        id: 'payments',
        title: t('club_core.settings.groups.payments'),
        column: 1,
        fields: ['onlineFeeMode', 'onlineFeePercent', 'onlineFeeFixed', 'orderSalesDocument', 'bankAccount'],
      },
      {
        id: 'staff',
        title: t('club_core.settings.groups.staff'),
        column: 2,
        fields: ['coachSettlementModel', 'showCalledUpChildren', 'coachMayCancel'],
      },
      {
        id: 'retention',
        title: t('club_core.settings.groups.retention'),
        description: t('club_core.settings.groups.retention.description'),
        column: 2,
        fields: ['formerParticipantRetentionMonths'],
      },
      {
        id: 'consentTexts',
        title: t('club_core.settings.groups.consentTexts'),
        description: t('club_core.settings.groups.consentTexts.description'),
        column: 1,
        fields: CONSENT_TEXT_KEYS.map(consentTextField),
      },
    ],
    [t],
  )

  if (error) return <ErrorMessage label={errorMessage(error, t('club_core.settings.errors.load'))} />
  if (!settings) return <LoadingMessage label={t('club_core.settings.loading')} />

  return (
    <div className="flex flex-col gap-6">
      <CrudForm<FormValues>
        key={settings.updatedAt ?? 'defaults'}
        title={t('club_core.settings.title')}
        titleHeadingLevel={1}
        fields={fields}
        groups={groups}
        initialValues={toFormValues(settings)}
        submitLabel={t('club_core.settings.save')}
        onSubmit={async (values) => {
          try {
            await apiCallOrThrow(
              SETTINGS_API,
              {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(toPayload(values)),
              },
              { errorMessage: t('club_core.settings.errors.save') },
            )
          } catch (error: unknown) {
            throw remapConsentTextErrors(error, t('club_core.settings.errors.save'))
          }
          flash(t('club_core.settings.flash.saved'), 'success')
          await queryClient.invalidateQueries({ queryKey: ['club_core-settings'] })
        }}
      />
      <LogoPanel
        title={t('club_core.logo.club.title')}
        description={t('club_core.logo.club.description')}
        imageUrl={settings.logoUrl}
        initial={nameInitial(settings.shortName)}
        source={settings.logoAttachmentId ? 'club' : 'initial'}
        removable={Boolean(settings.logoAttachmentId)}
        updatedAt={settings.updatedAt}
        endpoint="/api/club_core/logo"
        canEdit
        testId="club-logo"
        onChanged={async () => {
          await queryClient.invalidateQueries({ queryKey: ['club_core-settings'] })
        }}
      />
    </div>
  )
}
