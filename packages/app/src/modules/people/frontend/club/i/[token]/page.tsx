// `/club/i/[token]` — the guardian's page of a personal invitation link (personal invitation link spec REQ-IL03,
// REQ-IL04, J-IL03; #868). Sessionless and rendered on the server: the token is inspected (the one system-scope lookup
// of `people_invitation_links.token_hash`, narrowed to its club; spends nothing, so a chat app's link preview is
// harmless). A valid link shows the club's name, one sentence on what the link is and **Set your password**; any other
// shows that the invitation is no longer valid and to ask the club for a new link, with the club's name when the link
// is known. Neither state shows anything about the guardian or the child.
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { InvitationStartButton } from '../../../../components/club/InvitationStartButton'
import { inspectInvitationLink } from '../../../../services/invitation-links'

export const dynamic = 'force-dynamic'

export default async function InvitationLinkRoute({ params }: { params?: { token?: string } }) {
  const token = params?.token ?? ''
  const { t } = await resolveTranslations()
  const page = await inspectInvitationLink(await createRequestContainer(), token)
  const clubName = page.club?.name || t('people.invitationLink.page.product', 'Vereino')
  return (
    <div className="bg-background text-foreground min-h-svh">
      <header className="bg-card border-b">
        <div className="mx-auto flex max-w-xl items-center px-4 py-3">
          <span className="font-semibold" data-testid="invitation-page-club">
            {clubName}
          </span>
        </div>
      </header>
      <main
        className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-8"
        data-testid="invitation-page"
        data-state={page.state}
      >
        {page.state === 'valid' ? (
          <>
            <h1 className="text-2xl font-semibold">
              {t('people.invitationLink.page.validTitle', 'Your invitation to {club}', { club: clubName })}
            </h1>
            <p className="text-muted-foreground max-w-prose">
              {t(
                'people.invitationLink.page.validBody',
                'You have been invited to {club} in Vereino. Set a password to see your family’s activities.',
                { club: clubName },
              )}
            </p>
            <InvitationStartButton
              token={token}
              labels={{
                start: t('people.invitationLink.page.start', 'Set your password'),
                starting: t('people.invitationLink.page.starting', 'Opening…'),
                error: t('people.invitationLink.page.error', 'Something went wrong. Try again.'),
              }}
            />
          </>
        ) : (
          <section className="flex flex-col gap-3" data-testid="invitation-page-invalid">
            <h1 className="text-2xl font-semibold">
              {t('people.invitationLink.page.invalidTitle', 'This invitation is no longer valid')}
            </h1>
            <p className="text-muted-foreground max-w-prose">
              {page.club
                ? t(
                    'people.invitationLink.page.invalidBodyClub',
                    'The link has been used, has expired or was replaced by a newer one. Ask {club} — your coach or the club office — for a new link.',
                    { club: page.club.name },
                  )
                : t(
                    'people.invitationLink.page.invalidBody',
                    'The link has been used, has expired or was replaced by a newer one. Ask your club — your coach or the club office — for a new link.',
                  )}
            </p>
          </section>
        )}
      </main>
    </div>
  )
}
