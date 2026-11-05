'use client'
// `/backend/people/persons/[id]` (club spec UI table; README B-10): the person record with the tabs "Details",
// "Guardianship and consents", "Roles", "Account" and "Groups" (charges arrive with phase 4), addressable by
// `?tab=details|guardianship|roles|account|groups` (#84). A coordinator reads the basic data only (`access: 'basic'`);
// the PESEL field is there only with `people.pesel.view`; editing needs `people.manage`, roles `people.roles.manage`.
// The account tab shows the account status to every reader and "Create account" only with `people.accounts.manage`.
// The "Groups" tab is the injection spot `vereino:people:person-record:groups`, filled by the `groups` module (so
// `people` never imports `groups`); it is shown only when a widget the user may see is registered there.
import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { AccessDeniedMessage, ErrorMessage, LoadingMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { InjectionSpot, useInjectionWidgets } from '@open-mercato/ui/backend/injection/InjectionSpot'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { errorCodeOf } from '@vereino/core'
import { AccountPanel } from './AccountPanel'
import { GuardianshipsPanel } from './GuardianshipsPanel'
import { PersonDetailsForm } from './PersonForm'
import { RolesPanel } from './RolesPanel'
import {
  OWN_FORBIDDEN_STATE,
  PERSONS_HREF,
  PERSON_RECORD_TABS,
  personName,
  type PersonDetail,
  type PersonRecordTab,
  type Translate,
} from './client-helpers'
import { useGrantedFeatures } from './useGrantedFeatures'

/** The injection spot of the "Groups" tab (`groups/widgets/injection-table.ts`). */
const GROUPS_SPOT_ID = 'vereino:people:person-record:groups'

/** The tab of `?tab=` when it is shown, else Details (always shown). */
function tabFrom(value: string | null, allowed: readonly PersonRecordTab[]): PersonRecordTab {
  return allowed.find((tab) => tab === value) ?? 'details'
}

type PersonLoad =
  { status: 'ok'; person: PersonDetail } | { status: 'not_found' } | { status: 'denied' } | { status: 'unlinked' }

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
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const groupsSpot = useInjectionWidgets(GROUPS_SPOT_ID)
  const hasGroupsTab = groupsSpot.widgets.length > 0
  const query = useQuery({
    queryKey: ['people-person', id],
    queryFn: async (): Promise<PersonLoad> => {
      const call = await apiCall<PersonDetail>(`/api/people/persons/${encodeURIComponent(id)}`, OWN_FORBIDDEN_STATE)
      if (call.status === 404) return { status: 'not_found' }
      // 403 `scope_unlinked`: the account is not linked to a person of this club (#76).
      if (call.status === 403) {
        return errorCodeOf(call.result) === 'scope_unlinked' ? { status: 'unlinked' } : { status: 'denied' }
      }
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
  if (load.status === 'unlinked') return <AccessDeniedMessage label={t('foundation.errors.scope_unlinked')} />
  if (load.status === 'denied') return <AccessDeniedMessage label={t('people.persons.errors.denied')} />

  const person = load.person
  const canEdit = features['people.manage'] && person.access === 'full'
  const canCreateAccount = features['people.accounts.manage'] && person.access === 'full'
  const allowedTabs = PERSON_RECORD_TABS.filter((value) => value !== 'groups' || hasGroupsTab)
  const tab = tabFrom(searchParams.get('tab'), allowedTabs)
  const selectTab = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', value)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }
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
      <Tabs value={tab} onValueChange={selectTab} variant="underline">
        <div className="overflow-x-auto">
          <TabsList aria-label={t('people.persons.tabs.label')}>
            <TabsTrigger value="details">{t('people.persons.tabs.details')}</TabsTrigger>
            <TabsTrigger value="guardianship">{t('people.persons.tabs.guardianship')}</TabsTrigger>
            <TabsTrigger value="roles">{t('people.persons.tabs.roles')}</TabsTrigger>
            <TabsTrigger value="account">{t('people.persons.tabs.account')}</TabsTrigger>
            {hasGroupsTab ? <TabsTrigger value="groups">{t('people.persons.tabs.groups')}</TabsTrigger> : null}
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
          <RolesPanel
            personId={person.id}
            canManage={features['people.roles.manage']}
            onOpenGuardianship={() => {
              selectTab('guardianship')
            }}
          />
        </TabsContent>
        <TabsContent value="account" className="pt-4">
          <AccountPanel person={person} canCreate={canCreateAccount} onChanged={refetch} />
        </TabsContent>
        {hasGroupsTab ? (
          <TabsContent value="groups" className="pt-4">
            <InjectionSpot spotId={GROUPS_SPOT_ID} context={{ personId: person.id }} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  )
}
