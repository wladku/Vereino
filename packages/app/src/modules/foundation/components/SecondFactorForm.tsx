'use client'
// The code form of `/login/second-factor` (staff second factor spec UI row; REQ-2F01, REQ-2F05; J-2F01; #736): the
// six-digit code e-mailed after a challenged password sign-in, "Send a new code" (60 s countdown) and "Back to
// sign-in". A wrong code announces the attempts left; an expired or ended challenge returns to `/login` with a
// sentence; the right code lands on the page the sign-in was heading to. The provisional token rides in its HttpOnly
// cookie, so the page never handles it.
import * as React from 'react'
import Link from 'next/link'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { errorCodeOf } from '@vereino/core'

const RESEND_SPACING_SECONDS = 60
const EXPIRED_PATH = '/login?second_factor=expired'
/** The platform's `apiCall` would send a 401 to `/login` itself; this page decides where an ended challenge goes. */
const NO_REDIRECT = { 'x-om-unauthorized-redirect': '0', 'x-om-forbidden-redirect': '0' }

type Status = { kind: 'error' | 'info'; text: string } | null

type CodeAnswer = { ok?: boolean; redirect?: string; code?: string; attemptsLeft?: number; nextResendAt?: string }

export function SecondFactorForm({ emailHint }: { emailHint: string }) {
  const t = useT()
  const inputId = React.useId()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [code, setCode] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [status, setStatus] = React.useState<Status>(null)
  const [wait, setWait] = React.useState(RESEND_SPACING_SECONDS)

  React.useEffect(() => {
    inputRef.current?.focus()
  }, [])

  React.useEffect(() => {
    if (wait <= 0) return
    const timer = setTimeout(() => {
      setWait((seconds) => seconds - 1)
    }, 1000)
    return () => {
      clearTimeout(timer)
    }
  }, [wait])

  const leave = (path: string) => {
    window.location.assign(path)
  }

  const refused = (status: number, answer: CodeAnswer | null) => {
    const errorCode = errorCodeOf(answer)
    if (status === 401 || errorCode === 'second_factor_challenge_expired') {
      leave(EXPIRED_PATH)
      return
    }
    if (errorCode === 'second_factor_code_invalid' && typeof answer?.attemptsLeft === 'number') {
      setStatus({ kind: 'error', text: t('foundation.secondFactor.page.attemptsLeft', { count: answer.attemptsLeft }) })
      return
    }
    if (errorCode === 'second_factor_code_invalid') {
      setStatus({ kind: 'error', text: t('foundation.secondFactor.page.codeFormat') })
      return
    }
    if (errorCode === 'second_factor_resend_limited') {
      if (answer?.nextResendAt) {
        setWait(Math.max(1, Math.ceil((Date.parse(answer.nextResendAt) - Date.now()) / 1000)))
        setStatus({ kind: 'error', text: t('foundation.secondFactor.page.resendWait') })
      } else {
        setStatus({ kind: 'error', text: t('foundation.secondFactor.page.resendSpent') })
      }
      return
    }
    setStatus({ kind: 'error', text: t('foundation.errors.second_factor_unavailable') })
  }

  const submit = async (event: { preventDefault(): void }) => {
    event.preventDefault()
    const typed = code.replace(/\s+/g, '')
    if (!/^\d{6}$/.test(typed)) {
      setStatus({ kind: 'error', text: t('foundation.secondFactor.page.codeFormat') })
      return
    }
    setPending(true)
    try {
      const call = await apiCall<CodeAnswer>('/api/foundation/second-factor/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...NO_REDIRECT },
        body: JSON.stringify({ code: typed }),
      })
      if (call.ok && call.result?.redirect) {
        leave(call.result.redirect)
        return
      }
      refused(call.status, call.result)
      setCode('')
      inputRef.current?.focus()
    } catch {
      setStatus({ kind: 'error', text: t('foundation.errors.second_factor_unavailable') })
    } finally {
      setPending(false)
    }
  }

  const resend = async () => {
    setPending(true)
    try {
      const call = await apiCall<CodeAnswer>('/api/foundation/second-factor/resend', {
        method: 'POST',
        headers: NO_REDIRECT,
      })
      if (call.ok) {
        setWait(RESEND_SPACING_SECONDS)
        setStatus({ kind: 'info', text: t('foundation.secondFactor.page.resent') })
        return
      }
      refused(call.status, call.result)
    } catch {
      setStatus({ kind: 'error', text: t('foundation.errors.second_factor_unavailable') })
    } finally {
      setPending(false)
      inputRef.current?.focus()
    }
  }

  return (
    <form className="grid gap-4" onSubmit={(event) => void submit(event)} noValidate data-testid="second-factor-form">
      <p className="text-sm" data-testid="second-factor-hint">
        {t('foundation.secondFactor.page.sent', { email: emailHint })}
      </p>
      <div className="grid gap-2">
        <Label htmlFor={inputId}>{t('foundation.secondFactor.page.codeLabel')}</Label>
        <Input
          id={inputId}
          ref={inputRef}
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          value={code}
          onChange={(event) => {
            setCode(event.target.value)
          }}
          aria-invalid={status?.kind === 'error'}
          aria-describedby={`${inputId}-status`}
          className="min-h-11 text-center text-lg tracking-widest"
          data-testid="second-factor-code"
        />
      </div>
      <div id={`${inputId}-status`} aria-live="polite" role="status">
        {status ? (
          <p
            className={
              status.kind === 'error'
                ? 'border-status-error-border bg-status-error-bg text-status-error-text rounded-md border px-3 py-2 text-sm'
                : 'border-status-info-border bg-status-info-bg text-status-info-text rounded-md border px-3 py-2 text-sm'
            }
            data-testid="second-factor-status"
          >
            {status.text}
          </p>
        ) : null}
      </div>
      <Button type="submit" className="min-h-11" disabled={pending} data-testid="second-factor-submit">
        {t(pending ? 'foundation.secondFactor.page.submitting' : 'foundation.secondFactor.page.submit')}
      </Button>
      <div className="flex flex-col items-center gap-2 text-sm sm:flex-row sm:justify-between">
        <Button
          type="button"
          variant="link"
          className="min-h-11"
          disabled={pending || wait > 0}
          onClick={() => void resend()}
          data-testid="second-factor-resend"
        >
          {wait > 0
            ? t('foundation.secondFactor.page.resendIn', { seconds: wait })
            : t('foundation.secondFactor.page.resend')}
        </Button>
        <Link href="/login" className="text-muted-foreground inline-flex min-h-11 items-center underline">
          {t('foundation.secondFactor.page.back')}
        </Link>
      </div>
    </form>
  )
}
