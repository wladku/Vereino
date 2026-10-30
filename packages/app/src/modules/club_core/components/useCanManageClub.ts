'use client'
// Whether the signed-in user holds a `club_core` feature (wildcard-aware, through the platform's feature check). Only
// hides actions the server would refuse anyway; authorization stays on the routes and commands.
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

function grants(granted: readonly string[], feature: string): boolean {
  return granted.some(
    (entry) => entry === '*' || entry === feature || (entry.endsWith('.*') && feature.startsWith(entry.slice(0, -1))),
  )
}

export function useHasClubFeature(feature: string): boolean {
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

/** `club_core.manage`: the club administrator's structure and settings writes. */
export function useCanManageClub(): boolean {
  return useHasClubFeature('club_core.manage')
}

/** `club_core.sections.public_content`: a section's public page, logo and materials (#29). */
export function useCanEditSectionContent(): boolean {
  return useHasClubFeature('club_core.sections.public_content')
}
