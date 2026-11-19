'use client'
// The person linked to the signed-in panel user (navigation spec REQ-N04; #260), read once per session from
// `GET /api/people/me` and shared by the top-bar link "Member interface" and the dashboard greeting. `null` while it
// loads, on an error or on 404 `person_not_linked`: then the link is not rendered and the greeting has no name.
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

export const STAFF_PERSON_QUERY_KEY = ['vereino', 'backend', 'people-me'] as const

export type StaffPerson = { firstName: string }

async function readStaffPerson(): Promise<StaffPerson | null> {
  const call = await apiCall<{ person?: { firstName?: unknown } }>('/api/people/me')
  if (call.status === 404) return null
  const firstName = call.result?.person?.firstName
  if (!call.ok || typeof firstName !== 'string') throw new Error(`people/me ${String(call.status)}`)
  return { firstName }
}

/** The linked person, `undefined` until the read answers, `null` when the account is linked to no person. */
export function useStaffPerson(): { person: StaffPerson | null | undefined; loading: boolean } {
  const query = useQuery({
    queryKey: STAFF_PERSON_QUERY_KEY,
    queryFn: readStaffPerson,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: false,
    refetchOnWindowFocus: false,
  })
  return { person: query.isError ? null : query.data, loading: query.isPending }
}
