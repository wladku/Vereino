// `/identity/deletion?code=` — the status page Facebook's data-deletion callback names (social sign-in spec REQ-S03,
// AC-S03; #567). The callback deletes the link before it answers, so every well-formed confirmation code is done: the
// page says so without looking anything up, and therefore reveals nothing about who asked or whether a link existed.
// A missing or malformed code gets a neutral hint. Static and sessionless; it names no club.
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { isConfirmationCode } from '../../../lib/identity'

type Props = { searchParams?: Record<string, string | string[] | undefined> }

export default async function IdentityDeletionStatusPage({ searchParams }: Props) {
  const { t } = await resolveTranslations()
  const code = searchParams?.code
  const known = isConfirmationCode(code)
  return (
    <main className="bg-background text-foreground flex min-h-svh flex-col items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-md flex-col gap-4" data-testid="identity-deletion-status">
        <h1 className="text-2xl font-semibold">{t('foundation.identity.deletion.title', 'Data deletion request')}</h1>
        {known ? (
          <>
            <p className="text-sm">
              {t(
                'foundation.identity.deletion.done',
                'Your request is complete: Vereino no longer keeps the connection to your Facebook account.',
              )}
            </p>
            <p className="text-muted-foreground text-sm">
              {t('foundation.identity.deletion.code', 'Confirmation code: {code}', { code })}
            </p>
            <p className="text-muted-foreground text-sm">
              {t(
                'foundation.identity.deletion.rest',
                'Your club account itself stays. To sign in, use your e-mail and password; to have your account removed, contact your club.',
              )}
            </p>
          </>
        ) : (
          <p className="text-sm" data-testid="identity-deletion-unknown">
            {t(
              'foundation.identity.deletion.unknown',
              'Open the link Facebook gave you after your request, with its confirmation code.',
            )}
          </p>
        )}
      </div>
    </main>
  )
}
