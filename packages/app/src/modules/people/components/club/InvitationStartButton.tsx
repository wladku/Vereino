'use client'
// **Set your password** on `/club/i/[token]` (personal invitation link spec REQ-IL03, J-IL03 step 2; #868): asks
// `POST /api/people/invitations/{token}/start` for the platform's password-setup page and opens it. A link that became
// invalid meanwhile (410) reloads the page, which then shows the invalid state; any other failure offers a retry.
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'

export type InvitationStartButtonProps = {
  token: string
  labels: { start: string; starting: string; error: string }
}

export function InvitationStartButton({ token, labels }: InvitationStartButtonProps) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [failed, setFailed] = React.useState(false)

  const start = async () => {
    setBusy(true)
    setFailed(false)
    try {
      const call = await apiCall<{ url?: string }>(`/api/people/invitations/${encodeURIComponent(token)}/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (call.ok && call.result?.url) {
        window.location.assign(call.result.url)
        return
      }
      if (call.status === 410) {
        router.refresh()
      } else {
        setFailed(true)
      }
    } catch {
      setFailed(true)
    }
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button
          type="button"
          className="min-h-11"
          disabled={busy}
          aria-busy={busy}
          onClick={() => void start()}
          data-testid="invitation-page-start"
        >
          {busy ? labels.starting : labels.start}
        </Button>
      </div>
      {failed ? (
        <p role="alert" className="text-sm" data-testid="invitation-page-error">
          {labels.error}
        </p>
      ) : null}
    </div>
  )
}
