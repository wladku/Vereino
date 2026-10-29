'use client'
// `/backend/people/persons/create` and the "Details" tab of `/backend/people/persons/[id]` (club spec UI table, J-001
// step 2): the person's own fields in a `CrudForm`. The PESEL field is shown — and sent — only to a user with
// `people.pesel.view`; the e-mail, phone, notes and PESEL are stored encrypted.
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { createCrud, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { PERSONS_HREF, textOrNull, type PersonDetail, type Translate } from './client-helpers'

const ENTITY_ID = 'people:person'
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
      { id: 'birthDate', label: t('people.persons.fields.birthDate'), type: 'date', layout: 'half' },
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

/** The request body; the PESEL only when the user may see it (otherwise it is left as it is). */
function payload(values: Partial<PersonFormValues>, withPesel: boolean) {
  return {
    firstName: typeof values.firstName === 'string' ? values.firstName.trim() : '',
    lastName: typeof values.lastName === 'string' ? values.lastName.trim() : '',
    birthDate: textOrNull(values.birthDate),
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
        const created = await createCrud<{ id?: string }>('people/persons', payload(values, withPesel))
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
        await updateCrud('people/persons', { id: person.id, ...payload(values, withPesel) })
        flash(t('people.persons.flash.saved'), 'success')
        await onSaved()
      }}
    />
  )
}
