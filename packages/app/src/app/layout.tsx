import type { Metadata } from 'next'
import './globals.css'
import '@/lib/i18n/register-dictionary-loader'
import { AppProviders } from '@/components/AppProviders'
import { resolveLocalizedAppMetadata } from '@/lib/metadata'
import { APPLE_TOUCH_ICON_SIZE, WEB_APP_ICON_PATH } from '@/modules/club_core/lib/web-app'
import { parseBooleanWithDefault } from '@open-mercato/shared/lib/boolean'
import { getPasswordPolicy } from '@open-mercato/shared/lib/auth/passwordPolicy'
import { PasswordPolicyBridge } from '@/components/PasswordPolicyBridge'

import { THEME_INIT_SCRIPT } from '@open-mercato/ui/theme/theme-init-script'
import { detectLocale, loadDictionary, resolveSupportedLocalesForRequest } from '@open-mercato/shared/lib/i18n/server'
import { resolveForcedLocale } from '@open-mercato/shared/lib/i18n/locale'
import { resolveDevRuntimeLayoutConfig } from '@open-mercato/shared/lib/dev-runtime/layout'
import { DevRuntimeDiagnosticsBanner } from '@open-mercato/ui/backend/dev/DevRuntimeDiagnosticsBanner'
import { DevRuntimeReporter } from '@open-mercato/ui/backend/dev/DevRuntimeReporter'

// The tab says "Vereino" and "{page} — Vereino" in every locale, with the Vereino mark as its icon (#485). The home
// screen icon of an iPhone is the address's app icon (`app-icon/[size]`, D-045, #873); the manifest is linked by
// `manifest.ts`.
export async function generateMetadata(): Promise<Metadata> {
  return {
    ...(await resolveLocalizedAppMetadata()),
    icons: { icon: '/vereino-mark.svg', apple: `${WEB_APP_ICON_PATH}/${String(APPLE_TOUCH_ICON_SIZE)}` },
    appleWebApp: { capable: true, statusBarStyle: 'default' },
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolved server-side (the tenant's Settings selection needs a container and
  // the app registry) and handed to the client provider, which can read neither.
  const supportedLocales = await resolveSupportedLocalesForRequest()
  const locale = await detectLocale({ supportedLocales })
  const dict = await loadDictionary(locale)
  const localeLocked = resolveForcedLocale(process.env) !== null
  // The demo widgets are opt-in (`DEMO_MODE=true`, or `1`/`yes`/`on`); a club instance never shows them by default (#485).
  const demoModeEnabled = parseBooleanWithDefault(process.env.DEMO_MODE, false)
  const noticeBarsEnabled = process.env.OM_INTEGRATION_TEST !== 'true'
  const devRuntime = resolveDevRuntimeLayoutConfig(process.env)
  // The platform's password forms read the policy in the browser, where `OM_PASSWORD_*` is not set (#779).
  const passwordPolicy = getPasswordPolicy()
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {devRuntime.meta.map((meta) => (
          <meta key={meta.name} name={meta.name} content={meta.content} />
        ))}
      </head>
      <body className="antialiased" suppressHydrationWarning data-gramm="false">
        <script id="om-theme-init" dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <AppProviders locale={locale} dict={dict} localeLocked={localeLocked} supportedLocales={supportedLocales} demoModeEnabled={demoModeEnabled} noticeBarsEnabled={noticeBarsEnabled}>
          <PasswordPolicyBridge policy={passwordPolicy} />
          {devRuntime.enabled ? <DevRuntimeReporter /> : null}
          {devRuntime.bannerEnabled ? <DevRuntimeDiagnosticsBanner /> : null}
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
