'use client'
// `/backend/people/persons/[id]` (club spec UI table): the person record with the tabs "Details", "Guardianship and
// consents", "Roles" and "Account" (groups and charges arrive with phases 2 and 4). A coordinator reads the basic
// data only (`access: 'basic'`); the PESEL field is there only with `people.pesel.view`; editing needs
// `people.manage`, roles `people.roles.manage`, the account tab `people.accounts.manage`.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { AccessDeniedMessage, ErrorMessage, LoadingMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { AccountPanel } from './AccountPanel'
import { GuardianshipsPanel } from './GuardianshipsPanel'
import { PersonDetailsForm } from './PersonForm'
import { RolesPanel } from './RolesPanel'
import { PERSONS_HREF, personName, type PersonDetail, type Translate } from './client-helpers'
import { useGrantedFeatures } from './useGrantedFeatures'

type PersonLoad = { status: 'ok'; person: PersonDetail } | { status: 'not_found' } | { status: 'denied' }

function ReadOnlyDetails({ person, t }: { person: PersonDetail; t: Translate }) {
  const rows: Array<[string, string | null | undefined]> = [
    [t('people.persons.fields.firstName'), person.firstName],
    [t('people.persons.fields.lastName'), person.lastName],
    [t('people.persons.fields.birthDate'), person.birthDate],
    [
      t('people.persons.fields.preferredLocale'),
      person.preferredLocale ? t(`people.locales.${person.preferredLocale}`) : t('people.locales.default'),
    ],
  ]
  if (person.access === 'full') {
    rows.push([t('people.persons.fields.email'), person.email], [t('people.persons.fields.phone'), person.phone])
    if ('pesel' in person) rows.push([t('people.persons.fields.pesel'), person.pesel])
    rows.push([t('people.persons.fields.notes'), person.notes])
  }
  return (
    <section
      className="bg-card flex flex-col gap-3 rounded-lg border p-4"
      aria-label={t('people.persons.tabs.details')}
    >
      {person.access === 'basic' ? (
        <p className="text-muted-foreground text-sm">{t('people.persons.basicNotice')}</p>
      ) : null}
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="text-sm break-words whitespace-pre-wrap">{value || t('people.common.empty')}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function PersonRecord({ id }: { id: string }) {
  const t = useT()
  const features = useGrantedFeatures()
  const [tab, setTab] = React.useState('details')
  const query = useQuery({
    queryKey: ['people-person', id],
    queryFn: async (): Promise<PersonLoad> => {
      const call = await apiCall<PersonDetail>(`/api/people/persons/${encodeURIComponent(id)}`)
      if (call.status === 404) return { status: 'not_found' }
      if (call.status === 403) return { status: 'denied' }
      if (!call.ok || !call.result) throw new Error(t('people.persons.errors.loadOne'))
      return { status: 'ok', person: call.result }
    },
  })
  const refetch = React.useCallback(async () => {
    await query.refetch()
  }, [query])

  if (query.isLoading) return <LoadingMessage label={t('people.persons.loading')} />
  if (query.error) return <ErrorMessage label={t('people.persons.errors.loadOne')} />
  const load = query.data
  if (!load || load.status === 'not_found') {
    return (
      <RecordNotFoundState
        label={t('people.persons.errors.notFound')}
        backHref={PERSONS_HREF}
        backLabel={t('people.persons.actions.back')}
      />
    )
  }
  if (load.status === 'denied') return <AccessDeniedMessage label={t('people.persons.errors.denied')} />

  const person = load.person
  const canEdit = features['people.manage'] && person.access === 'full'
  const canSeeAccount = features['people.accounts.manage'] && person.access === 'full'
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold break-words">
            {personName(person) || t('people.persons.record.title')}
          </h1>
          <span className="text-muted-foreground text-sm">{t('people.persons.record.title')}</span>
        </div>
        <StatusBadge variant={person.hasAccount ? 'success' : 'neutral'}>
          {person.hasAccount ? t('people.persons.account.yes') : t('people.persons.account.no')}
        </StatusBadge>
      </header>
      <Tabs value={tab} onValueChange={setTab} variant="underline">
        <div className="overflow-x-auto">
          <TabsList aria-label={t('people.persons.tabs.label')}>
            <TabsTrigger value="details">{t('people.persons.tabs.details')}</TabsTrigger>
            <TabsTrigger value="guardianship">{t('people.persons.tabs.guardianship')}</TabsTrigger>
            <TabsTrigger value="roles">{t('people.persons.tabs.roles')}</TabsTrigger>
            {canSeeAccount ? <TabsTrigger value="account">{t('people.persons.tabs.account')}</TabsTrigger> : null}
          </TabsList>
        </div>
        <TabsContent value="details" className="pt-4">
          {canEdit ? (
            <PersonDetailsForm person={person} withPesel={features['people.pesel.view']} onSaved={refetch} />
          ) : (
            <ReadOnlyDetails person={person} t={t} />
          )}
        </TabsContent>
        <TabsContent value="guardianship" className="pt-4">
          <GuardianshipsPanel personId={person.id} canManage={features['people.manage']} />
        </TabsContent>
        <TabsContent value="roles" className="pt-4">
          <RolesPanel personId={person.id} canManage={features['people.roles.manage']} />
        </TabsContent>
        {canSeeAccount ? (
          <TabsContent value="account" className="pt-4">
            <AccountPanel person={person} onChanged={refetch} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  )
}
