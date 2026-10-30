// Types of the section list items as the client reads them, including the `people` enrichment.
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
  createdAt: string | null
  updatedAt: string | null
  _people?: { coordinators: SectionCoordinatorView[]; coordinatorMissing: boolean }
}

export function coordinatorName(coordinator: Pick<SectionCoordinatorView, 'firstName' | 'lastName'>): string {
  return [coordinator.firstName, coordinator.lastName].filter(Boolean).join(' ')
}
