'use client'
// `/backend/club/sections/create` and `/backend/club/sections/[id]/edit` (club spec UI table): the section's own
// fields in a `CrudForm`; the edit page adds the coordinators panel (`SectionCoordinators`) and, since #29, the
// section's logo, its "Public page" group and its materials. A coordinator of the section opens the edit page for
// those three; the section's own fields and its coordinators stay with the club administrator. UX parity spec REQ-U02
// (B-05): the edit page is split into the tabs Details / Coordinators / Public page, addressable by
// `?tab=details|coordinators|public`; deactivation moved to the list's row action, which a 409 with the section's
// active groups can refuse (also on delete here). Navigation spec REQ-N12 (B-04, B-05; #262): "Add section" offers an
// optional adult coordinator — the section is created first, then the role assignment, and a failed assignment lands
// on the new section's Coordinators tab with a warning; the section's coordinator reads the Coordinators tab; saving
// Details stays on the record.
import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { apiCallOrThrow, readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { ErrorMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { createCrud, deleteCrud, fetchCrudList, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { withFlash } from '@open-mercato/ui/backend/utils/flash'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useClubToday } from '@vereino/ui'
import { effectiveLogo, nameInitial, staffLogoUrl } from '../lib/files'
import { textOrNull, errorMessage, type Translate } from './client-helpers'
import { LogoPanel } from './LogoPanel'
import { CoordinatorPicker, SectionCoordinators } from './SectionCoordinators'
import { SectionInUseDialog } from './SectionInUseDialog'
import { SectionMaterialsPanel } from './SectionMaterialsPanel'
import { SectionPublicPanel } from './SectionPublicPanel'
import { sectionUsageOf, type SectionRow, type SectionUsageView } from './sections-shared'
import { useCanEditSectionContent, useCanManageClub } from './useCanManageClub'

type ClubBranding = { shortName: string | null; logoAttachmentId: string | null; publicSlug: string | null }

const LIST_HREF = '/backend/club/sections'
const ENTITY_ID = 'club_core:section'

/** The tabs of the section page and their `?tab=` values. */
const SECTION_TABS = ['details', 'coordinators', 'public'] as const
type SectionTab = (typeof SECTION_TABS)[number]

type SectionFormValues = {
  id?: string
  name: string
  description: string
  /** "Add section" only: the optional coordinator, assigned after the section is created (#262). */
  coordinatorId?: string | null
  updatedAt?: string | null
}

/** The section fields; the edit form accepts a stored name up to 200 characters (DD-U07), the server checks 2–80. */
function useSectionFields(t: Translate, nameMaxLength: number) {
  const fields = React.useMemo<CrudField[]>(
    () => [
      {
        id: 'name',
        label: t('club_core.sections.fields.name'),
        type: 'text',
        required: true,
        maxLength: nameMaxLength,
        description: t('club_core.sections.fields.name.help'),
      },
      {
        id: 'description',
        label: t('club_core.sections.fields.description'),
        type: 'textarea',
        description: t('club_core.sections.fields.description.help'),
      },
    ],
    [t, nameMaxLength],
  )
  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      {
        id: 'details',
        title: t('club_core.sections.groups.details'),
        column: 1,
        fields: ['name', 'description'],
      },
    ],
    [t],
  )
  return { fields, groups }
}

function payload(values: Partial<SectionFormValues>) {
  return {
    name: typeof values.name === 'string' ? values.name.trim() : '',
    description: textOrNull(values.description),
  }
}

/** The tab of `?tab=` when it is allowed, else Details (always allowed). */
function tabFrom(value: string | null, allowed: readonly SectionTab[]): SectionTab {
  return allowed.find((tab) => tab === value) ?? 'details'
}

export function SectionCreateForm() {
  const t = useT()
  const router = useRouter()
  const today = useClubToday()
  const section = useSectionFields(t, 80)
  const fields = React.useMemo<CrudField[]>(
    () => [
      ...section.fields,
      {
        id: 'coordinatorId',
        label: t('club_core.sections.fields.coordinator'),
        type: 'custom',
        description: t('club_core.sections.fields.coordinator.help'),
        component: ({ value, disabled, setValue }) => (
          <CoordinatorPicker
            value={typeof value === 'string' && value ? value : null}
            onChange={(next) => {
              setValue(next)
            }}
            disabled={disabled}
          />
        ),
      },
    ],
    [section.fields, t],
  )
  const groups = React.useMemo<CrudFormGroup[]>(
    () => section.groups.map((group) => ({ ...group, fields: [...(group.fields ?? []), 'coordinatorId'] })),
    [section.groups],
  )
  return (
    <CrudForm<SectionFormValues>
      title={t('club_core.sections.create.title')}
      titleHeadingLevel={1}
      backHref={LIST_HREF}
      cancelHref={LIST_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      initialValues={{ name: '', description: '', coordinatorId: null }}
      submitLabel={t('club_core.common.create')}
      onSubmit={async (values) => {
        const created = await createCrud<{ id?: string }>('club_core/sections', payload(values))
        const id = created.result?.id
        const coordinatorId =
          typeof values.coordinatorId === 'string' && values.coordinatorId ? values.coordinatorId : null
        if (!id || !coordinatorId) {
          router.push(withFlash(LIST_HREF, t('club_core.sections.flash.created'), 'success'))
          return
        }
        try {
          await apiCallOrThrow('/api/people/role-assignments', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ personId: coordinatorId, role: 'coordinator', sectionId: id, validFrom: today }),
          })
          router.push(withFlash(LIST_HREF, t('club_core.sections.flash.created'), 'success'))
        } catch {
          // Partial success: the section exists; the Coordinators tab is where the assignment is retried.
          router.push(
            withFlash(
              `${LIST_HREF}/${id}/edit?tab=coordinators`,
              t('club_core.sections.flash.createdWithoutCoordinator'),
              'warning',
            ),
          )
        }
      }}
    />
  )
}

export function SectionEditForm({ id }: { id: string }) {
  const t = useT()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { fields, groups } = useSectionFields(t, 200)
  const canManage = useCanManageClub()
  const canEditContent = useCanEditSectionContent()
  const [inUse, setInUse] = React.useState<SectionUsageView | null>(null)
  const club = useQuery({
    queryKey: ['club_core-settings'],
    queryFn: () => readApiResultOrThrow<ClubBranding>('/api/club_core/settings'),
  })
  const query = useQuery({
    queryKey: ['club_core-section', id],
    queryFn: async () => {
      const data = await fetchCrudList<SectionRow>('club_core/sections', { ids: id, pageSize: 1 })
      return data.items[0] ?? null
    },
  })
  const section = query.data ?? null
  const refetch = React.useCallback(async () => {
    await query.refetch()
  }, [query])

  const allowedTabs = React.useMemo<SectionTab[]>(
    () =>
      SECTION_TABS.filter((tab) =>
        tab === 'coordinators' ? canManage || canEditContent : tab === 'public' ? canEditContent : true,
      ),
    [canManage, canEditContent],
  )
  const tab = tabFrom(searchParams.get('tab'), allowedTabs)
  const selectTab = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', value)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  if (query.isSuccess && !section) {
    return (
      <RecordNotFoundState
        label={t('club_core.sections.errors.notFound')}
        backHref={LIST_HREF}
        backLabel={t('club_core.sections.actions.back')}
      />
    )
  }
  if (query.error) return <ErrorMessage label={errorMessage(query.error, t('club_core.sections.errors.load'))} />

  const branding = club.data ?? null
  const logo = effectiveLogo({
    sectionLogoId: section?.logoAttachmentId ?? null,
    clubLogoId: branding?.logoAttachmentId ?? null,
  })

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold break-words" data-testid="section-edit-name">
        {section?.name ?? t('club_core.sections.edit.title')}
      </h1>
      <Tabs value={tab} onValueChange={selectTab} variant="underline">
        <div className="overflow-x-auto">
          <TabsList aria-label={t('club_core.sections.tabs.label')}>
            {allowedTabs.map((value) => (
              <TabsTrigger key={value} value={value}>
                {t(`club_core.sections.tabs.${value}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="details" className="flex flex-col gap-6 pt-4">
          {canManage ? (
            <CrudForm<SectionFormValues>
              key={section ? (section.updatedAt ?? section.id) : 'loading'}
              title={t('club_core.sections.edit.title')}
              titleHeadingLevel={2}
              backHref={LIST_HREF}
              cancelHref={LIST_HREF}
              entityId={ENTITY_ID}
              fields={fields}
              groups={groups}
              isLoading={query.isLoading}
              loadingMessage={t('club_core.sections.loading')}
              initialValues={{
                id,
                name: section?.name ?? '',
                description: section?.description ?? '',
                updatedAt: section?.updatedAt ?? null,
              }}
              submitLabel={t('club_core.common.save')}
              deleteRedirect={withFlash(LIST_HREF, t('club_core.sections.flash.deleted'), 'success')}
              onSubmit={async (values) => {
                // Saving Details stays on the record (#262): the refetch brings the new name and lock token.
                await updateCrud('club_core/sections', { id, ...payload(values) })
                flash(t('club_core.sections.flash.saved'), 'success')
                await refetch()
              }}
              onDelete={async () => {
                try {
                  await deleteCrud('club_core/sections', id)
                } catch (error: unknown) {
                  const usage = sectionUsageOf(error)
                  if (usage) setInUse(usage)
                  throw error
                }
              }}
            />
          ) : null}
          {section ? (
            <LogoPanel
              title={t('club_core.logo.section.title')}
              description={t('club_core.logo.section.description')}
              imageUrl={staffLogoUrl(logo.attachmentId)}
              initial={nameInitial(branding?.shortName)}
              source={logo.source}
              removable={Boolean(section.logoAttachmentId)}
              updatedAt={section.updatedAt}
              endpoint={`/api/club_core/sections/${section.id}/logo`}
              canEdit={canEditContent}
              testId="section-logo"
              onChanged={refetch}
            />
          ) : null}
        </TabsContent>
        {canManage || canEditContent ? (
          <TabsContent value="coordinators" className="pt-4">
            {section ? <SectionCoordinators section={section} onChanged={refetch} readOnly={!canManage} /> : null}
          </TabsContent>
        ) : null}
        {canEditContent ? (
          <TabsContent value="public" className="flex flex-col gap-6 pt-4">
            {section ? (
              <SectionPublicPanel section={section} clubSlug={branding?.publicSlug ?? null} onChanged={refetch} />
            ) : null}
            {section ? <SectionMaterialsPanel sectionId={section.id} canEdit={canEditContent} /> : null}
          </TabsContent>
        ) : null}
      </Tabs>
      <SectionInUseDialog
        usage={inUse}
        onClose={() => {
          setInUse(null)
        }}
      />
    </div>
  )
}
