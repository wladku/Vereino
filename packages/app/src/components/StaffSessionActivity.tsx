'use client'
// The staff idle timeout in the browser (S8.5, ENG-Q-12; #737). The backend layout and the member layout render this
// only for a staff account. It notes the user's own input (pointer, keys, wheel, touch) — not background polling —
// shares the last input time across tabs, reports it to `POST /api/foundation/session/activity` at most once a minute
// (which keeps the server session alive), and signs out once the idle timeout passed without input in any tab. The
// server ends an unreported staff session on its own; this only stops the screen from showing data after that.
import * as React from 'react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { readJsonFromLocalStorage, writeJsonToLocalStorage } from '@open-mercato/shared/lib/browser/safeLocalStorage'
import { activityReportDue, staffSessionIdle } from '@vereino/core'

// A trivial scalar shared by the tabs (the last input time in ms); no schema to version.
const LAST_ACTIVITY_KEY = 'vereino:session:last-activity'
const CHECK_INTERVAL_MS = 15_000
const STORE_THROTTLE_MS = 5_000
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const

function sharedLastActivity(local: number): number {
  const stored = readJsonFromLocalStorage<number>(LAST_ACTIVITY_KEY, 0)
  return typeof stored === 'number' && stored > local ? stored : local
}

async function signOut(): Promise<void> {
  await apiCall('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
  const here = `${window.location.pathname}${window.location.search}`
  window.location.href = `/login?redirect=${encodeURIComponent(here)}`
}

export function StaffSessionActivity({ idleMinutes }: { idleMinutes: number }) {
  React.useEffect(() => {
    let lastActivityAt = Date.now()
    let lastStoredAt = 0
    let lastReportAt: number | null = null
    let ending = false
    writeJsonToLocalStorage(LAST_ACTIVITY_KEY, lastActivityAt)

    const noteActivity = () => {
      lastActivityAt = Date.now()
      if (lastActivityAt - lastStoredAt >= STORE_THROTTLE_MS) {
        lastStoredAt = lastActivityAt
        writeJsonToLocalStorage(LAST_ACTIVITY_KEY, lastActivityAt)
      }
    }

    const check = async () => {
      if (ending) return
      const now = Date.now()
      const latest = sharedLastActivity(lastActivityAt)
      if (staffSessionIdle({ lastActivityAt: latest, now, idleMinutes })) {
        ending = true
        await signOut()
        return
      }
      if (!activityReportDue({ lastActivityAt: latest, lastReportAt, now })) return
      lastReportAt = now
      const { status } = await apiCall('/api/foundation/session/activity', { method: 'POST' })
      if (status === 401) {
        ending = true
        await signOut()
      }
    }

    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, noteActivity, { passive: true })
    void check().catch(() => undefined)
    const timer = window.setInterval(() => {
      void check().catch(() => undefined)
    }, CHECK_INTERVAL_MS)
    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, noteActivity)
      window.clearInterval(timer)
    }
  }, [idleMinutes])
  return null
}
