import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJwt } from '@open-mercato/shared/lib/auth/jwt'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { Card, CardContent, CardDescription, CardHeader } from '@open-mercato/ui/primitives/card'
import { SecondFactorForm } from '@/modules/foundation/components/SecondFactorForm'
import { emailHint, readProvisionalClaims, secondFactorLoginPath } from '@/modules/foundation/lib/second-factor'

// The code page of the staff second factor (`.ai/specs/implemented/2026-11-26-vereino-staff-second-factor.md` UI row; REQ-2F01;
// #736). An app route beside `/login`, like it: the provisional token in the HttpOnly `auth_token` cookie names the
// address the code went to; without a provisional token the challenge is over and the browser goes back to `/login`.
export async function generateMetadata(): Promise<Metadata> {
  const { translate } = await resolveTranslations()
  return { title: { absolute: translate('foundation.secondFactor.page.title', 'Check your e-mail') } }
}

function provisionalEmail(token: string | undefined): string | null {
  if (!token) return null
  try {
    const payload = verifyJwt(token)
    if (!readProvisionalClaims(payload)) return null
    return typeof payload?.email === 'string' ? payload.email : null
  } catch {
    return null
  }
}

export default async function SecondFactorPage() {
  const email = provisionalEmail((await cookies()).get('auth_token')?.value)
  if (!email) redirect(secondFactorLoginPath('expired'))
  const { translate } = await resolveTranslations()
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-semibold">{translate('foundation.secondFactor.page.title', 'Check your e-mail')}</h1>
          <CardDescription>
            {translate('foundation.secondFactor.page.description', 'Your role signs in with a second factor.')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SecondFactorForm emailHint={emailHint(email)} />
        </CardContent>
      </Card>
    </main>
  )
}
