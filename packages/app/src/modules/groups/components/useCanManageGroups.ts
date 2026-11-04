'use client'
// Whether the signed-in user holds a feature (wildcard-aware, through the platform's feature check): `groups.manage`
// for the add, end and delete actions, `people.view` for the roster's links to the person record (a coach has no
// `people.view`). Only hides what the server would refuse anyway; authorization stays on the routes and commands
// (the scope as well: a coordinator manages only the groups of their sections).
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

function grants(granted: readonly string[], feature: string): boolean {
  return granted.some(
    (entry) => entry === '*' || entry === feature || (entry.endsWith('.*') && feature.startsWith(entry.slice(0, -1))),
  )
}

export function useHasFeature(feature: string): boolean {
  const query = useQuery({
    queryKey: ['feature-check', feature],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const call = await apiCall<{ granted?: unknown[] }>('/api/auth/feature-check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ features: [feature] }),
      })
      const granted = call.ok && Array.isArray(call.result?.granted) ? call.result.granted.map(String) : []
      return grants(granted, feature)
    },
  })
  return query.data === true
}

export function useCanManageGroups(): boolean {
  return useHasFeature('groups.manage')
}
