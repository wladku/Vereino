'use client'
// The browser side of the installable app (D-045, E31-S01 #873), mounted once at the app's root (`AppProviders`):
// registers the service worker (`public/sw.js`, offline page only), keeps the browser's install offer for the "Install"
// entry of the member menu (`installPromptStore` of `@vereino/ui`) and gives that entry its label, and on Safari on an
// iPhone shows the "Share → Add to Home Screen" hint on a member page once per device. It never asks for notification
// permission (N02).
import * as React from 'react'
import { X } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { installPromptStore, MemberInstallLabelContext } from '@vereino/ui'
import { IOS_INSTALL_HINT_KEY, shouldShowIosInstallHint } from '../lib/web-app'

function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
    // Without the worker the app works as before; only the offline page is missing.
  })
}

function readFlag(): boolean {
  try {
    return window.localStorage.getItem(IOS_INSTALL_HINT_KEY) !== null
  } catch {
    return true
  }
}

function writeFlag(): void {
  try {
    window.localStorage.setItem(IOS_INSTALL_HINT_KEY, new Date().toISOString())
  } catch {
    // A browser without storage shows no hint (readFlag answers true), so nothing is lost.
  }
}

function IosInstallHint({ pathname }: { pathname: string | null }) {
  const t = useT()
  const [visible, setVisible] = React.useState(false)
  React.useEffect(() => {
    const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
    const show = shouldShowIosInstallHint({
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints,
      standalone,
      seen: readFlag(),
      pathname,
    })
    if (!show) return
    // Once per device: the flag is set when the hint first shows.
    writeFlag()
    setVisible(true)
  }, [pathname])
  if (!visible) return null
  return (
    <aside
      aria-labelledby="web-app-ios-hint-title"
      className="bg-card text-card-foreground fixed inset-x-3 bottom-24 z-50 mx-auto flex max-w-md items-start gap-3 rounded-lg border p-4 shadow-lg"
      data-testid="web-app-ios-hint"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p id="web-app-ios-hint-title" className="text-sm font-semibold">
          {t('club_core.webApp.iosHint.title')}
        </p>
        <p className="text-muted-foreground text-sm">{t('club_core.webApp.iosHint.body')}</p>
      </div>
      <button
        type="button"
        className="hover:bg-accent focus-visible:focus-indicator -m-2 flex size-11 shrink-0 items-center justify-center rounded-md outline-none"
        aria-label={t('club_core.webApp.iosHint.dismiss')}
        data-testid="web-app-ios-hint-dismiss"
        onClick={() => {
          setVisible(false)
        }}
      >
        <X className="size-4" aria-hidden />
      </button>
    </aside>
  )
}

export function WebAppClient({ pathname, children }: { pathname: string | null; children: React.ReactNode }) {
  const t = useT()
  React.useEffect(() => {
    registerServiceWorker()
    return installPromptStore.capture(window)
  }, [])
  return (
    <MemberInstallLabelContext.Provider value={t('club_core.webApp.install')}>
      {children}
      <IosInstallHint pathname={pathname} />
    </MemberInstallLabelContext.Provider>
  )
}
