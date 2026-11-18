'use client'
// Whether the signed-in user holds a feature (wildcard-aware, through the platform's feature check):
// `communication.post` for "New announcement", `communication.cases.manage` for "Mark as case" and "Delete" on the
// member thread page (REQ-A12, #274). Only hides actions the server would refuse anyway; authorization stays on the
// routes and commands.
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

export function useCanPost(): boolean {
  return useHasFeature('communication.post')
}
