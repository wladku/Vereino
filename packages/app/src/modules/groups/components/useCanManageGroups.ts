'use client'
// Whether the signed-in user holds `groups.manage` (wildcard-aware, through the platform's feature check). Only hides
// actions the server would refuse anyway; authorization stays on the routes and commands (the scope as well: a
// coordinator manages only the groups of their sections).
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

const FEATURE = 'groups.manage'

function grants(granted: readonly string[], feature: string): boolean {
  return granted.some(
    (entry) => entry === '*' || entry === feature || (entry.endsWith('.*') && feature.startsWith(entry.slice(0, -1))),
  )
}

export function useCanManageGroups(): boolean {
  const query = useQuery({
    queryKey: ['feature-check', FEATURE],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const call = await apiCall<{ granted?: unknown[] }>('/api/auth/feature-check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ features: [FEATURE] }),
      })
      const granted = call.ok && Array.isArray(call.result?.granted) ? call.result.granted.map(String) : []
      return grants(granted, FEATURE)
    },
  })
  return query.data === true
}
