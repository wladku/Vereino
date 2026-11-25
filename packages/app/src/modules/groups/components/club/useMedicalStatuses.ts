'use client'
// The medical certificate status of the roster's participants (training outlines and medical expiry spec M-O1, REQ-O02,
// DD-O03; #682), read over HTTP from `people` (`GET /api/people/medical-status`; `groups` never imports `people`). The
// read is quiet: a caller without `people.medical.view` (403), a failed request or a person outside the caller's scope
// yields no status, so the page shows no chip and no filter rather than an error.
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { medicalStatusUrls, medicalStatusesById, type MedicalStatusItem, type MedicalStatusLabels } from '@vereino/ui'
import { OWN_FORBIDDEN_STATE } from '../client-helpers'

const NONE: ReadonlyMap<string, MedicalStatusItem> = new Map()

export function useMedicalStatuses(personIds: readonly string[]): ReadonlyMap<string, MedicalStatusItem> {
  const urls = medicalStatusUrls(personIds)
  const query = useQuery({
    queryKey: ['groups-medical-status', urls],
    enabled: urls.length > 0,
    retry: false,
    queryFn: async () => {
      const calls = await Promise.all(urls.map((url) => apiCall<unknown>(url, OWN_FORBIDDEN_STATE)))
      return medicalStatusesById(calls.filter((call) => call.ok).map((call) => call.result))
    },
  })
  return query.data ?? NONE
}

/** The chip's words and the reader's day format. */
export function useMedicalLabels(): { labels: MedicalStatusLabels; formatDate: (day: string) => string } {
  const t = useT()
  const locale = useLocale()
  return {
    labels: {
      missing: t('groups.club.medical.missing'),
      unknown: t('groups.club.medical.unknown'),
      expired: (date) => t('groups.club.medical.expired', { date }),
      expiring: (date) => t('groups.club.medical.expiring', { date }),
      valid: (date) => t('groups.club.medical.valid', { date }),
    },
    formatDate: (day) =>
      new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(`${day}T00:00:00Z`),
      ),
  }
}
