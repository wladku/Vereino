'use client'
// `/backend/people/first-administrator` (people life-cycle spec REQ-L13, J-L08 step 1; #305): the technical
// administrator picks a user of the organization, types the first and last name and confirms; the user becomes the
// club administrator. Reached from the banner while the club has none; once it has one, the page says who it is.
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { CrudForm, type CrudCustomFieldRenderProps, type CrudField } from '@open-mercato/ui/backend/CrudForm'
import { Notice } from '@vereino/ui'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { LookupSelect, type LookupSelectItem } from '@open-mercato/ui/backend/inputs'
import { apiCallOrThrow, readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { PERSONS_HREF, errorMessage } from './client-helpers'

export const FIRST_ADMINISTRATOR_API = '/api/people/first-administrator'
export const FIRST_ADMINISTRATOR_QUERY_KEY = ['people-first-administrator']

export type FirstAdministratorStatus = { administrator: { personId: string; name: string } | null }

type FormValues = Record<string, unknown>

type UserRow = { id: string; email: string; name: string | null }

/** The club's administrator, or null while it has none (`GET /api/people/first-administrator`). */
export function useFirstAdministratorStatus(enabled = true) {
  return useQuery({
    queryKey: FIRST_ADMINISTRATOR_QUERY_KEY,
    queryFn: () => readApiResultOrThrow<FirstAdministratorStatus>(FIRST_ADMINISTRATOR_API),
    enabled,
  })
}

async function searchUsers(query: string): Promise<LookupSelectItem[]> {
  const params = new URLSearchParams({ pageSize: '20', scopeToActiveOrganization: 'true' })
  if (query.trim()) params.set('search', query.trim())
  const data = await readApiResultOrThrow<{ items?: UserRow[] }>(`/api/auth/users?${params.toString()}`)
  return (data.items ?? []).map((user) => ({ id: user.id, title: user.email, subtitle: user.name }))
}

function UserField({ value, setValue, disabled, error }: CrudCustomFieldRenderProps) {
  const t = useT()
  return (
    <div className="flex flex-col gap-1" data-testid="people-first-administrator-user">
      <LookupSelect
        value={typeof value === 'string' && value ? value : null}
        onChange={(next) => {
          setValue(next ?? '')
        }}
        fetchItems={searchUsers}
        minQuery={0}
        placeholder={t('people.firstAdministrator.user.placeholder')}
        searchPlaceholder={t('people.firstAdministrator.user.search')}
        emptyLabel={t('people.firstAdministrator.user.empty')}
        loadingLabel={t('people.common.loading')}
        clearLabel={t('people.common.clear')}
        selectLabel={t('people.common.select')}
        selectedLabel={t('people.common.selected')}
        disabled={disabled}
      />
      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function AdministratorExists({ administrator }: { administrator: { personId: string; name: string } }) {
  const t = useT()
  return (
    <Notice data-testid="people-first-administrator-exists">
      <AlertTitle>{t('people.firstAdministrator.exists.title')}</AlertTitle>
      <AlertDescription>
        {t('people.firstAdministrator.exists.body', { name: administrator.name })}{' '}
        <Link className="underline" href={`${PERSONS_HREF}/${administrator.personId}`}>
          {t('people.firstAdministrator.exists.open')}
        </Link>
      </AlertDescription>
    </Notice>
  )
}

export function FirstAdministratorPage() {
  const t = useT()
  const router = useRouter()
  const status = useFirstAdministratorStatus()
  const fields = React.useMemo<CrudField[]>(
    () => [
      {
        id: 'userId',
        label: t('people.firstAdministrator.fields.user'),
        type: 'custom',
        required: true,
        description: t('people.firstAdministrator.fields.user.help'),
        component: UserField,
        rendersOwnError: true,
      },
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
    ],
    [t],
  )

  if (status.isLoading) return <LoadingMessage label={t('people.common.loading')} />
  if (status.isError || !status.data) {
    return <ErrorMessage label={errorMessage(status.error, t('people.firstAdministrator.errors.load'))} />
  }
  if (status.data.administrator) return <AdministratorExists administrator={status.data.administrator} />

  return (
    <CrudForm<FormValues>
      title={t('people.firstAdministrator.title')}
      titleHeadingLevel={1}
      backHref="/backend"
      cancelHref="/backend"
      fields={fields}
      initialValues={{ userId: '', firstName: '', lastName: '' }}
      submitLabel={t('people.firstAdministrator.submit')}
      onSubmit={async (values) => {
        const userId = typeof values.userId === 'string' ? values.userId : ''
        if (!userId) {
          const message = t('people.firstAdministrator.errors.userRequired')
          throw createCrudFormError(message, { userId: message })
        }
        try {
          await apiCallOrThrow(FIRST_ADMINISTRATOR_API, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ userId, firstName: values.firstName, lastName: values.lastName }),
          })
        } catch (error: unknown) {
          // A 409 `club_admin_exists` (someone made an administrator meanwhile): the page then says who it is.
          await status.refetch()
          throw error
        }
        flash(t('people.firstAdministrator.flash.created'), 'success')
        router.push(PERSONS_HREF)
      }}
    />
  )
}
