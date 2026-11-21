'use client'
// The banner of `widget.ts`: shown only while `GET /api/people/first-administrator` answers no administrator, and not
// on the first-administrator page itself.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useFirstAdministratorStatus } from '../../../components/FirstAdministratorPage'

export const FIRST_ADMINISTRATOR_HREF = '/backend/people/first-administrator'

export default function FirstAdministratorBanner() {
  const t = useT()
  const pathname = usePathname()
  const onPage = pathname === FIRST_ADMINISTRATOR_HREF
  const status = useFirstAdministratorStatus(!onPage)
  if (onPage || !status.data || status.data.administrator) return null
  return (
    <Alert style="light" status="warning" className="mb-4" data-testid="people-first-administrator-banner">
      <AlertTitle>{t('people.firstAdministrator.banner.title')}</AlertTitle>
      <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span>{t('people.firstAdministrator.banner.body')}</span>
        <Button asChild size="sm" className="min-h-11 w-full sm:w-auto">
          <Link href={FIRST_ADMINISTRATOR_HREF}>{t('people.firstAdministrator.banner.action')}</Link>
        </Button>
      </AlertDescription>
    </Alert>
  )
}
