'use client'
// Which of the `people` features the signed-in user holds, through the shared wildcard-aware hook of `@vereino/ui`
// (people life-cycle spec REQ-L14). Only hides actions and fields the server would refuse or omit anyway;
// authorization stays on the routes and commands.
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useGrantedFeatures as useSharedGrantedFeatures, type FeatureGrants } from '@vereino/ui'

export const PEOPLE_UI_FEATURES = [
  'people.manage',
  'people.roles.manage',
  'people.accounts.manage',
  'people.pesel.view',
  'people.persons.anonymize',
  'people.persons.export',
  'club_core.manage',
] as const

export type PeopleUiFeature = (typeof PEOPLE_UI_FEATURES)[number]

export type GrantedFeatures = FeatureGrants<PeopleUiFeature>

export function useGrantedFeatures(): GrantedFeatures {
  return useSharedGrantedFeatures(PEOPLE_UI_FEATURES, apiCall)
}
