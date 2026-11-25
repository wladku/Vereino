// The neutral landing page of the instance's own address (many clubs spec phase 3, UI table "`/` on the bare club
// domain", REQ-M02; #631): the product name, a hint that every club has its own address, and the sign-in for the
// maintainers. Static and sessionless; it names no club, so nothing about any club can leak from it.
import Image from 'next/image'
import Link from 'next/link'
import { clubDomain } from '@vereino/core'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'

export async function ClubLanding() {
  const { t } = await resolveTranslations()
  const example = `${t('club_core.landing.exampleSlug', 'your-club')}.${clubDomain(process.env) ?? ''}`
  return (
    <main className="bg-background text-foreground flex min-h-svh flex-col items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center" data-testid="club-landing">
        <Image src="/vereino-mark.svg" alt="" width={64} height={64} className="size-16" priority />
        <h1 className="text-2xl font-semibold">{t('club_core.landing.title', 'Vereino')}</h1>
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">{t('club_core.landing.findClub', 'Find your club')}</h2>
          <p className="text-muted-foreground text-sm">
            {t(
              'club_core.landing.hint',
              'Every club has its own address, such as {example}. Open the link your club gave you, or the one in its e-mails.',
              { example },
            )}
          </p>
        </div>
        <Link
          href="/login"
          className="text-primary text-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
          data-testid="club-landing-sign-in"
        >
          {t('club_core.landing.signIn', 'Sign in to manage the service')}
        </Link>
      </div>
    </main>
  )
}
