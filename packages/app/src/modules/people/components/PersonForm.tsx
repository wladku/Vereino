'use client'
// `/backend/people/persons/create` and the "Details" tab of `/backend/people/persons/[id]` (club spec UI table, J-001
// step 2): the person's own fields in a `CrudForm`. The PESEL value is shown — and sent — only to a user with
// `people.pesel.view`; anyone else sees the field empty and disabled with a hint (#262). The e-mail, phone, notes and
// PESEL are stored encrypted. A created person opens on the guardianship tab, where flow F-01 continues (#84). The date
// of birth is a native date input (typed or pasted, `dd.mm.rrrr` in a Polish browser) bounded to the last 120 years.
// The external id (an import identifier for a person without a PESEL, #28) is an identifier like the PESEL: the API
// returns it only with `people.pesel.view`, so the field is shown — and sent — only then (people life-cycle spec
// REQ-L12, #304); another person's id answers 409 `external_id_duplicate`, shown on the field.
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { createCrud, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { birthDateBounds, birthDateProblem, errorCodeOf, type BirthDateProblem } from '@vereino/core'
import { clubToday, dateField, useClubTimeZone, useClubToday } from '@vereino/ui'
import { PERSONS_HREF, personRecordHref, textOrNull, type PersonDetail, type Translate } from './client-helpers'

const ENTITY_ID = 'people:person'
// What the date input stores for a partly typed date; `birthDateProblem` reports it as malformed.
const INCOMPLETE_BIRTH_DATE = 'incomplete'
const LOCALES = ['pl', 'en'] as const

type PersonFormValues = {
  id?: string
  firstName: string
  lastName: string
  birthDate: string
  preferredLocale: string
  email: string
  phone: string
  pesel: string
  externalId: string
  notes: string
  updatedAt?: string | null
}

function usePersonFields(t: Translate, withPesel: boolean) {
  const today = useClubToday()
  const fields = React.useMemo<CrudField[]>(() => {
    const list: CrudField[] = [
      {
        id: 'firstName',
        label: t('people.persons.fields.firstName'),
        type: 'text',
        required: true,
        maxLength: 200,
        layout: 'half',
      },
      {
        id: 'lastName',
        label: t('people.persons.fields.lastName'),
        type: 'text',
        required: true,
        maxLength: 200,
        layout: 'half',
      },
      dateField('birthDate', t('people.persons.fields.birthDate'), {
        layout: 'half',
        incompleteValue: INCOMPLETE_BIRTH_DATE,
        ...birthDateBounds(today),
      }),
      {
        id: 'preferredLocale',
        label: t('people.persons.fields.preferredLocale'),
        type: 'select',
        layout: 'half',
        description: t('people.persons.fields.preferredLocale.help'),
        options: [
          { value: '', label: t('people.locales.default') },
          ...LOCALES.map((locale) => ({ value: locale, label: t(`people.locales.${locale}`) })),
        ],
      },
      { id: 'email', label: t('people.persons.fields.email'), type: 'text', maxLength: 320 },
      { id: 'phone', label: t('people.persons.fields.phone'), type: 'text', maxLength: 50 },
      {
        id: 'notes',
        label: t('people.persons.fields.notes'),
        type: 'textarea',
        maxLength: 4000,
        description: t('people.persons.fields.notes.help'),
      },
    ]
    // Without `people.pesel.view` the field stays in place, empty and disabled with the hint (navigation spec
    // REQ-N12, B-10; #262): no value, no "has a PESEL" flag, and the request never carries it.
    list.push({
      id: 'pesel',
      label: t('people.persons.fields.pesel'),
      type: 'text',
      maxLength: 11,
      description: withPesel ? t('people.persons.fields.pesel.help') : t('people.persons.fields.pesel.hintOther'),
      ...(withPesel ? {} : { disabled: true }),
    })
    if (withPesel) {
      list.push({
        id: 'externalId',
        label: t('people.persons.fields.externalId'),
        type: 'text',
        maxLength: 100,
        description: t('people.persons.fields.externalId.help'),
      })
    }
    return list
  }, [t, withPesel, today])
  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      {
        id: 'details',
        title: t('people.persons.groups.details'),
        column: 1,
        fields: [
          'firstName',
          'lastName',
          'birthDate',
          'preferredLocale',
          'pesel',
          ...(withPesel ? ['externalId'] : []),
        ],
      },
      { id: 'contact', title: t('people.persons.groups.contact'), column: 2, fields: ['email', 'phone'] },
      { id: 'internal', title: t('people.persons.groups.internal'), column: 2, fields: ['notes'] },
    ],
    [t, withPesel],
  )
  return { fields, groups }
}

const BIRTH_DATE_MESSAGES: Record<BirthDateProblem, string> = {
  malformed: 'people.persons.errors.birthDateInvalid',
  future: 'people.persons.errors.birthDateFuture',
  too_old: 'people.persons.errors.birthDateTooOld',
}

/** The request body; the PESEL and the external id only when the user may see them (otherwise left as they are). */
/** `today` is the club's calendar date at the save (#231): a birth date after it is in the future. */
function payload(values: Partial<PersonFormValues>, withPesel: boolean, t: Translate, today: string) {
  const birthDate = textOrNull(values.birthDate)
  const problem = birthDate ? birthDateProblem(birthDate, today) : null
  if (problem) {
    const message = t(BIRTH_DATE_MESSAGES[problem])
    throw createCrudFormError(message, { birthDate: message })
  }
  return {
    firstName: typeof values.firstName === 'string' ? values.firstName.trim() : '',
    lastName: typeof values.lastName === 'string' ? values.lastName.trim() : '',
    birthDate,
    preferredLocale: textOrNull(values.preferredLocale),
    email: textOrNull(values.email),
    phone: textOrNull(values.phone),
    notes: textOrNull(values.notes),
    ...(withPesel ? { pesel: textOrNull(values.pesel), externalId: textOrNull(values.externalId) } : {}),
  }
}

/** A refused save: an external id another person has (409 `external_id_duplicate`) shows at its field. */
function externalIdConflict(error: unknown): unknown {
  if (errorCodeOf(error) !== 'external_id_duplicate') return error
  const message = error instanceof Error ? error.message : String(error)
  return createCrudFormError(message, { externalId: message }, { status: 409 })
}

export function PersonCreateForm({ withPesel }: { withPesel: boolean }) {
  const t = useT()
  const timeZone = useClubTimeZone()
  const router = useRouter()
  const { fields, groups } = usePersonFields(t, withPesel)
  return (
    <CrudForm<PersonFormValues>
      title={t('people.persons.create.title')}
      titleHeadingLevel={1}
      backHref={PERSONS_HREF}
      cancelHref={PERSONS_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      initialValues={{
        firstName: '',
        lastName: '',
        birthDate: '',
        preferredLocale: '',
        email: '',
        phone: '',
        pesel: '',
        externalId: '',
        notes: '',
      }}
      submitLabel={t('people.common.create')}
      onSubmit={async (values) => {
        const created = await createCrud<{ id?: string }>(
          'people/persons',
          payload(values, withPesel, t, clubToday(new Date(), timeZone)),
        ).catch((error: unknown) => {
          throw externalIdConflict(error)
        })
        flash(t('people.persons.flash.created'), 'success')
        router.push(created.result?.id ? personRecordHref(created.result.id, 'guardianship') : PERSONS_HREF)
      }}
    />
  )
}

export function PersonDetailsForm({
  person,
  withPesel,
  onSaved,
}: {
  person: PersonDetail
  withPesel: boolean
  onSaved: () => Promise<void>
}) {
  const t = useT()
  const timeZone = useClubTimeZone()
  const { fields, groups } = usePersonFields(t, withPesel)
  return (
    <CrudForm<PersonFormValues>
      key={person.updatedAt ?? person.id}
      embedded
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      initialValues={{
        id: person.id,
        firstName: person.firstName ?? '',
        lastName: person.lastName ?? '',
        birthDate: person.birthDate ?? '',
        preferredLocale: person.preferredLocale ?? '',
        email: person.email ?? '',
        phone: person.phone ?? '',
        pesel: withPesel ? (person.pesel ?? '') : '',
        externalId: withPesel ? (person.externalId ?? '') : '',
        notes: person.notes ?? '',
        updatedAt: person.updatedAt,
      }}
      submitLabel={t('people.common.save')}
      onSubmit={async (values) => {
        await updateCrud('people/persons', {
          id: person.id,
          ...payload(values, withPesel, t, clubToday(new Date(), timeZone)),
        }).catch((error: unknown) => {
          throw externalIdConflict(error)
        })
        flash(t('people.persons.flash.saved'), 'success')
        await onSaved()
      }}
    />
  )
}
