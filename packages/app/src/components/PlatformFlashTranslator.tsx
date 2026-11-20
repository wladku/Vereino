"use client"
// Shows the platform's English-only toasts (access denied, session expired) in the page language (#483, epic #479
// owner decision 7: work around Open Mercato bugs on the Vereino side and report them upstream). The platform raises a
// toast as a `flash` event on `window` and its `FlashMessages` listener reads `detail.message`. One capture-phase
// listener, added when this module loads (before any React effect, so also before `FlashMessages` subscribes, and never
// removed, so a re-render or a locale refresh leaves no gap), rewrites the message in place with the latest translate
// function the mounted component hands over. Mounted once in `AppProviders`.
import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { platformFlashText } from '@/lib/platform-flash'

type Translate = (key: string, params?: Record<string, string>) => string

let translate: Translate | null = null

function translatePlatformFlash(event: Event) {
  const detail = (event as CustomEvent<{ message?: unknown } | null>).detail
  if (!translate || !detail || typeof detail.message !== 'string') return
  const text = platformFlashText(detail.message)
  if (text) detail.message = translate(text.key, text.params)
}

if (typeof window !== 'undefined') window.addEventListener('flash', translatePlatformFlash, { capture: true })

export function PlatformFlashTranslator() {
  const t = useT()
  // A child of `QueryProvider`: this effect runs before the provider patches `fetch`, so no platform toast comes first.
  React.useEffect(() => {
    translate = t
  }, [t])
  return null
}
