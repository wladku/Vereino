// The offline page of the installed app (D-045, E31-S01 #873): the service worker (`public/sw.js`) keeps one copy and
// shows it for a page opened without network, instead of the browser's error. It names no person and no club, so the
// copy is the same for everyone on the device; the language follows the request (`locale` cookie, then the browser).
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { offlinePageHtml } from '@/modules/club_core/lib/web-app'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const { locale, t } = await resolveTranslations()
  const html = offlinePageHtml({
    lang: locale,
    title: t('club_core.webApp.offline.title', 'You are offline'),
    message: t('club_core.webApp.offline.message', 'Vereino needs a connection. Check the network and try again.'),
    retry: t('club_core.webApp.offline.retry', 'Try again'),
  })
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex' },
  })
}
