// Who shares contact details with coaches (club spec REQ-037, DD-39; #34): a live person who gave the consent
// `share_contact_with_coaches_at` and has an account — the consent is given and withdrawn in the profile, so a guardian
// without an account never shares. Pure: the filter `people.personDirectory` runs for the ids and for the values.

export type ContactSharingScope = { readonly tenantId: string; readonly organizationId: string }

export function contactSharingFilter(scope: ContactSharingScope, ids: readonly string[]) {
  return {
    id: { $in: [...new Set(ids)] },
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    deletedAt: null,
    shareContactWithCoachesAt: { $ne: null },
    userId: { $ne: null },
  }
}
