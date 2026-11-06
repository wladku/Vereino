'use client'
// The options of a member's direct thread (`GET /api/communication/direct`; foundation III REQ-M12, DD-M18): read by
// the inbox (whether to offer "Write to the coach") and the page `/club/messages/new`, one cache entry for both.
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { DIRECT_OPTIONS_QUERY_KEY, type DirectOption } from '../client-helpers'

class DirectOptionsLoadError extends Error {}

export function useDirectOptions() {
  return useQuery({
    queryKey: DIRECT_OPTIONS_QUERY_KEY,
    queryFn: async () => {
      const call = await apiCall<{ items: DirectOption[] }>('/api/communication/direct')
      if (!call.ok || !call.result) throw new DirectOptionsLoadError(String(call.status))
      return call.result.items
    },
  })
}

/** Whether an option has anyone to address (its group's coaches or its section's coordinators). */
export function hasStaff(option: DirectOption): boolean {
  return option.coachNames.length > 0 || option.coordinatorNames.length > 0
}
