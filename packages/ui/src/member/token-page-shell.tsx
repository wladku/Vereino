// `TokenPageShell` (foundation P-19, phase C; REQ-F14; UX concept M-14): the frame of a page opened from a personal
// link without signing in (`/club/d/[token]`, later `/club/o/[token]` and the request confirmations). The page resolves
// the token first and passes the state: `loading`; `expired` (410, "Link expired — request a new one") and `not_found`
// (404, an unknown or malformed link), both with the way to request a new link; `error` with a retry; `ok` renders the
// children. Framework-free and without state: the router's link component, the header's end (a language switcher) and
// every string come in through props.
import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import type { MemberLinkProps } from '#tsx/member/member-shell'

export type TokenPageState = 'loading' | 'ok' | 'expired' | 'not_found' | 'error'

export type TokenPageShellLabels = {
  /** The header's name before the club is known. */
  title: string
  loading: string
  expiredTitle: string
  expiredMessage: string
  notFoundTitle: string
  notFoundMessage: string
  errorMessage: string
  retry: string
  requestLink: string
}

export type TokenPageShellProps = {
  state: TokenPageState
  /** The club's name once the token resolved. */
  clubName?: string | null
  labels: TokenPageShellLabels
  /** Where a new link is requested (the link request page). */
  requestLinkHref: string
  Link: React.ComponentType<MemberLinkProps>
  onRetry: () => void
  headerEnd?: React.ReactNode
  children?: React.ReactNode
}

function Problem(props: {
  title: string
  message: string
  requestLinkHref: string
  requestLink: string
  Link: React.ComponentType<MemberLinkProps>
  testId: string
}) {
  const { Link } = props
  return (
    <section className="flex flex-col gap-3" aria-labelledby="token-page-problem" data-testid={props.testId}>
      <h1 id="token-page-problem" className="text-2xl font-semibold">
        {props.title}
      </h1>
      <p className="text-muted-foreground max-w-prose">{props.message}</p>
      <div>
        <Button asChild className="min-h-11">
          <Link href={props.requestLinkHref}>{props.requestLink}</Link>
        </Button>
      </div>
    </section>
  )
}

function Body(props: TokenPageShellProps) {
  const { labels } = props
  switch (props.state) {
    case 'loading':
      return (
        <p role="status" className="text-muted-foreground" data-testid="token-page-loading">
          {labels.loading}
        </p>
      )
    case 'expired':
      return (
        <Problem
          title={labels.expiredTitle}
          message={labels.expiredMessage}
          requestLinkHref={props.requestLinkHref}
          requestLink={labels.requestLink}
          Link={props.Link}
          testId="token-page-expired"
        />
      )
    case 'not_found':
      return (
        <Problem
          title={labels.notFoundTitle}
          message={labels.notFoundMessage}
          requestLinkHref={props.requestLinkHref}
          requestLink={labels.requestLink}
          Link={props.Link}
          testId="token-page-not-found"
        />
      )
    case 'error':
      return (
        <section role="alert" className="flex flex-col gap-3" data-testid="token-page-error">
          <p>{labels.errorMessage}</p>
          <div>
            <Button type="button" variant="outline" className="min-h-11" onClick={props.onRetry}>
              {labels.retry}
            </Button>
          </div>
        </section>
      )
    case 'ok':
      return <>{props.children}</>
  }
}

export function TokenPageShell(props: TokenPageShellProps) {
  return (
    <div className="bg-background text-foreground min-h-svh">
      <header className="bg-card border-b">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span className="font-semibold" data-testid="token-page-club">
            {props.clubName ?? props.labels.title}
          </span>
          {props.headerEnd}
        </div>
      </header>
      <main
        className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6"
        data-testid="token-page"
        data-state={props.state}
      >
        <Body {...props} />
      </main>
    </div>
  )
}
