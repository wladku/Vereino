'use client'
// The group sign-up QR code on `/club/groups/[id]` (E29-S02, #869; D41, D44, D29): while a parent scanning it would get
// the section's sign-up form with this group chosen (`GET /api/enrolment/groups/{id}/sign-up-code` answers `open`),
// the group page shows **Sign-up QR code**; it opens a sheet with the code to show at training, the address with
// **Copy link** and — where the phone offers it — **Share**, and **Download for printing**, an A4 poster drawn in the
// browser (`qrPosterSvg` of `@vereino/ui`). Nothing shows while the answer loads, fails or says `closed`: the group
// is not public, or the section or the group takes no applications. The code holds the public address only.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { QrCode, qrPosterSvg } from '@vereino/ui'
import { DialogContent } from '@/components/ui/dialog'
import { groupSignUpCodeApi } from '../../lib/paths'

type SignUpCode =
  | { status: 'open'; url: string; clubName: string; sectionName: string; groupName: string }
  | { status: 'closed'; groupName: string }

async function fetchSignUpCode(groupId: string): Promise<SignUpCode | null> {
  const call = await apiCall<SignUpCode>(groupSignUpCodeApi(groupId))
  return call.ok && call.result ? call.result : null
}

function downloadPoster(svg: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function CodeSheet({
  code,
  open,
  onOpenChange,
}: {
  code: Extract<SignUpCode, { status: 'open' }>
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useT()
  const [copied, setCopied] = React.useState(false)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code.url)
      setCopied(true)
    } catch {
      // Without clipboard access the address stays selectable in its field.
      setCopied(false)
    }
  }
  const share = async () => {
    try {
      await navigator.share({ title: t('enrolment.signUpCode.shareTitle', { group: code.groupName }), url: code.url })
    } catch {
      // The person closed the share sheet; nothing to do.
    }
  }
  const download = () => {
    const svg = qrPosterSvg({
      value: code.url,
      title: code.groupName,
      lines: [`${code.clubName} · ${code.sectionName}`, t('enrolment.signUpCode.posterScan')],
    })
    downloadPoster(svg, 'sign-up-qr-code.svg')
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setCopied(false)
        onOpenChange(next)
      }}
    >
      <DialogContent closeAriaLabel={t('enrolment.signUpCode.close')} data-testid="group-sign-up-code-dialog">
        <DialogHeader>
          <DialogTitle>{t('enrolment.signUpCode.title', { group: code.groupName })}</DialogTitle>
          <DialogDescription>{t('enrolment.signUpCode.description', { section: code.sectionName })}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <QrCode
            value={code.url}
            label={t('enrolment.signUpCode.qrLabel', { group: code.groupName })}
            data-testid="group-sign-up-code-qr"
          />
          <label className="flex w-full flex-col gap-1 text-sm">
            <span className="font-medium">{t('enrolment.signUpCode.linkField')}</span>
            <input
              readOnly
              value={code.url}
              className="bg-muted w-full rounded-md border px-3 py-2 font-mono text-xs"
              data-testid="group-sign-up-code-url"
              onFocus={(event) => {
                event.currentTarget.select()
              }}
            />
          </label>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              type="button"
              className="min-h-11 w-full sm:w-auto"
              data-testid="group-sign-up-code-download"
              onClick={download}
            >
              {t('enrolment.signUpCode.download')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full sm:w-auto"
              data-testid="group-sign-up-code-copy"
              onClick={() => void copy()}
            >
              {t('enrolment.signUpCode.copy')}
            </Button>
            {canShare ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 w-full sm:w-auto"
                data-testid="group-sign-up-code-share"
                onClick={() => void share()}
              >
                {t('enrolment.signUpCode.share')}
              </Button>
            ) : null}
          </div>
          <p className="sr-only" role="status" aria-live="polite" data-testid="group-sign-up-code-copied">
            {copied ? t('enrolment.signUpCode.copied') : ''}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function GroupSignUpCode({ groupId }: { groupId: string }) {
  const t = useT()
  const [open, setOpen] = React.useState(false)
  const query = useQuery({
    queryKey: ['enrolment-group-sign-up-code', groupId],
    queryFn: () => fetchSignUpCode(groupId),
    enabled: groupId !== '',
    retry: false,
  })
  const code = query.data
  if (code?.status !== 'open') return null
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="min-h-11 self-start"
        data-testid="group-sign-up-code-open"
        onClick={() => {
          setOpen(true)
        }}
      >
        {t('enrolment.signUpCode.open')}
      </Button>
      <CodeSheet code={code} open={open} onOpenChange={setOpen} />
    </>
  )
}
