// The web app manifest of the request's address (D-045, E31-S01 #873): Next.js serves it at `/manifest.webmanifest` and
// links it from every page. A club's address carries the club's name, colour and logo while the club publishes its page;
// any other address carries Vereino's name and mark (`club_core/lib/web-app.ts`). Sessionless: browsers fetch the
// manifest without cookies, and it names no person.
import type { MetadataRoute } from 'next'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { PRODUCT_NAME } from '@/lib/metadata'
import { webAppManifest } from '@/modules/club_core/lib/web-app'
import { requestWebApp } from '@/modules/club_core/services/web-app'

export const dynamic = 'force-dynamic'

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { locale, t } = await resolveTranslations()
  const { identity } = await requestWebApp(t('app.metadata.title', PRODUCT_NAME))
  return webAppManifest(identity, locale)
}
