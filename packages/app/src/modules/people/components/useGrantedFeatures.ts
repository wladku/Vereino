'use client'
// Which of the `people` features the signed-in user holds (wildcard-aware, through the platform's feature check).
// Only hides actions and fields the server would refuse or omit anyway; authorization stays on the routes and
// commands.
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

export const PEOPLE_UI_FEATURES = [
  'people.manage',
  'people.roles.manage',
  'people.accounts.manage',
  'people.pesel.view',
] as const

export type PeopleUiFeature = (typeof PEOPLE_UI_FEATURES)[number]

export type GrantedFeatures = { [feature in PeopleUiFeature]: boolean } & { loaded: boolean }

function grants(granted: readonly string[], feature: string): boolean {
  return granted.some(
    (entry) => entry === '*' || entry === feature || (entry.endsWith('.*') && feature.startsWith(entry.slice(0, -1))),
  )
}

export function useGrantedFeatures(): GrantedFeatures {
  const query = useQuery({
    queryKey: ['feature-check', ...PEOPLE_UI_FEATURES],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const call = await apiCall<{ granted?: unknown[] }>('/api/auth/feature-check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ features: PEOPLE_UI_FEATURES }),
      })
      return call.ok && Array.isArray(call.result?.granted) ? call.result.granted.map(String) : []
    },
  })
  const granted = query.data ?? []
  return {
    loaded: query.isSuccess,
    'people.manage': grants(granted, 'people.manage'),
    'people.roles.manage': grants(granted, 'people.roles.manage'),
    'people.accounts.manage': grants(granted, 'people.accounts.manage'),
    'people.pesel.view': grants(granted, 'people.pesel.view'),
  }
}
