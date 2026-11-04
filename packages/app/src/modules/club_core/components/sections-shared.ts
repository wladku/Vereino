// Types of the section list items as the client reads them, including the `people` and `groups` enrichments, and the
// reader of a 409 `section_has_active_groups` (UX parity spec REQ-U02).
export type SectionCoordinatorView = {
  assignmentId: string
  personId: string
  firstName: string | null
  lastName: string | null
  validFrom: string
  validTo: string | null
  updatedAt: string
  active: boolean
}

export type SectionRow = {
  id: string
  name: string | null
  description: string | null
  isActive: boolean
  logoAttachmentId: string | null
  isPublic: boolean
  publicSlug: string | null
  publicDescription: string | null
  publicConditions: string | null
  publicContactName: string | null
  publicContactEmail: string | null
  publicContactPhone: string | null
  shortDescription: string | null
  createdAt: string | null
  updatedAt: string | null
  _people?: { coordinators: SectionCoordinatorView[]; coordinatorMissing: boolean }
  _groups?: { activeGroupCount: number }
}

/** The active groups a 409 `section_has_active_groups` lists (at most 20) and their total. */
export type SectionUsageView = { groups: { id: string; name: string }[]; total: number }

/** The groups of a 409 `section_has_active_groups`, or null for any other error. */
export function sectionUsageOf(error: unknown): SectionUsageView | null {
  if (!error || typeof error !== 'object') return null
  const { code, details } = error as { code?: unknown; details?: unknown }
  if (code !== 'section_has_active_groups' || !details || typeof details !== 'object') return null
  const { groups, total } = details as { groups?: unknown; total?: unknown }
  if (!Array.isArray(groups)) return null
  const items = groups.filter(
    (group): group is { id: string; name: string } =>
      Boolean(group) &&
      typeof (group as { id?: unknown }).id === 'string' &&
      typeof (group as { name?: unknown }).name === 'string',
  )
  return { groups: items, total: typeof total === 'number' ? total : items.length }
}

export function coordinatorName(coordinator: Pick<SectionCoordinatorView, 'firstName' | 'lastName'>): string {
  return [coordinator.firstName, coordinator.lastName].filter(Boolean).join(' ')
}
