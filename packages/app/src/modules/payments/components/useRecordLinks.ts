'use client'
// Whether the signed-in user may open a person's record (`people.view`). The treasurer (payments spec DD-33, #245)
// works with the club's finances only, so a Finance page shows a person's name as text instead of a link the people
// module would refuse. Hides links only; the people routes authorize themselves.
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useGrantedFeatures } from '@vereino/ui'

const PEOPLE_RECORD_FEATURES = ['people.view'] as const

export function usePeopleRecordAccess(): boolean {
  return useGrantedFeatures(PEOPLE_RECORD_FEATURES, apiCall)['people.view']
}

const CLUB_SETTINGS_FEATURES = ['club_core.manage'] as const

/** Whether the signed-in user may open the club settings (B-02, `club_core.manage`); the treasurer may not (#245). */
export function useClubSettingsAccess(): boolean {
  return useGrantedFeatures(CLUB_SETTINGS_FEATURES, apiCall)['club_core.manage']
}
