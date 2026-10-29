'use client'
// Which `activities` write features the signed-in user holds (wildcard-aware, through the platform's feature check).
// Only hides actions the server would refuse anyway; authorization stays on the routes and commands (the scope as
// well: a coordinator plans only the activities of their sections, a coach cancels only the sessions of their groups).
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

const FEATURES = ['activities.manage', 'activities.coach', 'activities.events.create'] as const

export type ActivitiesFeatures = {
  /** Plan activities and move sessions (`activities.manage`). */
  manage: boolean
  /** Cancel sessions (`activities.coach`). */
  coach: boolean
  /** Create one-off events (`activities.events.create`). */
  createEvents: boolean
}

function grants(granted: readonly string[], feature: string): boolean {
  return granted.some(
    (entry) => entry === '*' || entry === feature || (entry.endsWith('.*') && feature.startsWith(entry.slice(0, -1))),
  )
}

export function useActivitiesFeatures(): ActivitiesFeatures {
  const query = useQuery({
    queryKey: ['feature-check', ...FEATURES],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const call = await apiCall<{ granted?: unknown[] }>('/api/auth/feature-check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ features: FEATURES }),
      })
      return call.ok && Array.isArray(call.result?.granted) ? call.result.granted.map(String) : []
    },
  })
  const granted = query.data ?? []
  return {
    manage: grants(granted, 'activities.manage'),
    coach: grants(granted, 'activities.coach'),
    createEvents: grants(granted, 'activities.events.create'),
  }
}
