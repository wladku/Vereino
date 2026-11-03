'use client'
// `/backend/people/persons/create` and the "Details" tab of `/backend/people/persons/[id]` (club spec UI table, J-001
// step 2): the person's own fields in a `CrudForm`. The PESEL field is shown — and sent — only to a user with
// `people.pesel.view`; the e-mail, phone, notes and PESEL are stored encrypted. The date of birth is a native date
// input (typed or pasted, `dd.mm.rrrr` in a Polish browser) bounded to the last 120 years.
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { createCrud, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { birthDateBounds, birthDateProblem, type BirthDateProblem } from '@vereino/core'
import { dateField } from '@vereino/ui'
import { PERSONS_HREF, localToday, textOrNull, type PersonDetail, type Translate } from './client-helpers'

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
  notes: string
  updatedAt?: string | null
}

function usePersonFields(t: Translate, withPesel: boolean) {
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
        ...birthDateBounds(localToday()),
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
    if (withPesel) {
      list.push({
        id: 'pesel',
        label: t('people.persons.fields.pesel'),
        type: 'text',
        maxLength: 11,
        description: t('people.persons.fields.pesel.help'),
      })
    }
    return list
  }, [t, withPesel])
  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      {
        id: 'details',
        title: t('people.persons.groups.details'),
        column: 1,
        fields: ['firstName', 'lastName', 'birthDate', 'preferredLocale', ...(withPesel ? ['pesel'] : [])],
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

/** The request body; the PESEL only when the user may see it (otherwise it is left as it is). */
function payload(values: Partial<PersonFormValues>, withPesel: boolean, t: Translate) {
  const birthDate = textOrNull(values.birthDate)
  const problem = birthDate ? birthDateProblem(birthDate, localToday()) : null
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
    ...(withPesel ? { pesel: textOrNull(values.pesel) } : {}),
  }
}

export function PersonCreateForm({ withPesel }: { withPesel: boolean }) {
  const t = useT()
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
        notes: '',
      }}
      submitLabel={t('people.common.create')}
      onSubmit={async (values) => {
        const created = await createCrud<{ id?: string }>('people/persons', payload(values, withPesel, t))
        flash(t('people.persons.flash.created'), 'success')
        router.push(created.result?.id ? `${PERSONS_HREF}/${created.result.id}` : PERSONS_HREF)
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
        pesel: person.pesel ?? '',
        notes: person.notes ?? '',
        updatedAt: person.updatedAt,
      }}
      submitLabel={t('people.common.save')}
      onSubmit={async (values) => {
        await updateCrud('people/persons', { id: person.id, ...payload(values, withPesel, t) })
        flash(t('people.persons.flash.saved'), 'success')
        await onSaved()
      }}
    />
  )
}
