// `InvitationSharePanel` (personal invitation link spec REQ-IL01, REQ-IL02, *UI and Interaction Contracts* → share
// sheet; #868): what staff see after asking for a guardian's invitation link — the QR code to scan, **Copy link** and,
// where the phone offers it, **Share** — and the states before and instead of it: issuing, rate-limited, no longer
// pending, error with a retry. Stateless: the caller (the panel's account tab, the coach's `/club/invitations`) issues
// the link, copies, shares and puts it in its own dialog; every string comes in translated through `labels`.
import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { QrCode } from '#tsx/member/qr-code'

export type InvitationShareState = 'issuing' | 'issued' | 'rate_limited' | 'not_pending' | 'error'

export type InvitationSharePanelLabels = {
  issuing: string
  /** "Share it only with this parent …" above the code. */
  warning: string
  qrLabel: string
  /** The label of the read-only field that holds the link. */
  linkField: string
  copy: string
  share: string
  /** Announced in the live region after a copy, e.g. "Link copied". */
  copied: string
  /** E.g. "Valid until 3 December. A new link replaces this one." */
  validity: string
  /** The 429 text with the wait already filled in. */
  rateLimited: string
  notPending: string
  error: string
  retry: string
}

export type InvitationSharePanelProps = {
  state: InvitationShareState
  /** The issued link (state `issued`). */
  url?: string | null
  labels: InvitationSharePanelLabels
  /** True once the link was copied; the live region announces it. */
  copied?: boolean
  /** Whether the device offers a share sheet (`navigator.share`); without it only **Copy link** shows. */
  canShare?: boolean
  onCopy: () => void
  onShare?: () => void
  onRetry: () => void
}

function Issued(props: InvitationSharePanelProps & { url: string }) {
  const { labels } = props
  return (
    <div className="flex flex-col items-center gap-4" data-testid="invitation-share-issued">
      <p className="text-muted-foreground text-sm">{labels.warning}</p>
      <QrCode value={props.url} label={labels.qrLabel} data-testid="invitation-share-qr" />
      <label className="flex w-full flex-col gap-1 text-sm">
        <span className="font-medium">{labels.linkField}</span>
        <input
          readOnly
          value={props.url}
          className="bg-muted w-full rounded-md border px-3 py-2 font-mono text-xs"
          data-testid="invitation-share-url"
          onFocus={(event) => {
            event.currentTarget.select()
          }}
        />
      </label>
      <div className="flex w-full flex-wrap gap-2">
        <Button type="button" className="min-h-11 flex-1" onClick={props.onCopy} data-testid="invitation-share-copy">
          {labels.copy}
        </Button>
        {props.canShare && props.onShare ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 flex-1"
            onClick={props.onShare}
            data-testid="invitation-share-share"
          >
            {labels.share}
          </Button>
        ) : null}
      </div>
      <p role="status" aria-live="polite" className="text-sm" data-testid="invitation-share-copied">
        {props.copied ? labels.copied : ''}
      </p>
      <p className="text-muted-foreground text-xs">{labels.validity}</p>
    </div>
  )
}

export function InvitationSharePanel(props: InvitationSharePanelProps) {
  const { labels } = props
  if (props.state === 'issued' && props.url) return <Issued {...props} url={props.url} />
  if (props.state === 'rate_limited') {
    return (
      <p role="alert" className="text-sm" data-testid="invitation-share-rate-limited">
        {labels.rateLimited}
      </p>
    )
  }
  if (props.state === 'not_pending') {
    return (
      <p role="status" className="text-sm" data-testid="invitation-share-not-pending">
        {labels.notPending}
      </p>
    )
  }
  if (props.state === 'error') {
    return (
      <div role="alert" className="flex flex-col gap-3" data-testid="invitation-share-error">
        <p className="text-sm">{labels.error}</p>
        <div>
          <Button type="button" variant="outline" className="min-h-11" onClick={props.onRetry}>
            {labels.retry}
          </Button>
        </div>
      </div>
    )
  }
  return (
    <p aria-busy="true" role="status" className="text-muted-foreground text-sm" data-testid="invitation-share-issuing">
      {labels.issuing}
    </p>
  )
}
