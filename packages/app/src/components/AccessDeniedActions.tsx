import Link from 'next/link'
import { Button } from '@open-mercato/ui/primitives/button'

// The next steps of an access-denied page (E20-S18, #497): the platform's catch-all pages offered one link only, to the
// dashboard or to `/` (the platform start page). A refused user can go to the place that is theirs, or sign out and sign
// in with another account (a parent who also coaches, a shared device). Rendered by the backend and frontend catch-alls.
export function AccessDeniedActions({
  homeHref,
  homeLabel,
  signOutLabel,
}: {
  homeHref: string
  homeLabel: string
  signOutLabel: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="access-denied-actions">
      <Button asChild size="sm" className="min-h-11">
        <Link href={homeHref}>{homeLabel}</Link>
      </Button>
      <form action="/api/auth/logout" method="POST">
        <Button type="submit" variant="outline" size="sm" className="min-h-11 text-foreground">
          {signOutLabel}
        </Button>
      </form>
    </div>
  )
}
