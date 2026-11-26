// The browser's install offer for the "Install" entry of the member menu (D-045, E31-S01 #873). Chrome and Edge fire
// `beforeinstallprompt` once, early, when the page is installable; the app keeps the event here (`capture`, called
// once at the app's root) and the menu shows the entry while an offer is held. Browsers without the event (Safari,
// Firefox) never show the entry. Framework-free: the event target is passed in, the label comes from a provider.
import * as React from 'react'

/** The `beforeinstallprompt` event (not in the DOM typings). */
export type InstallPromptEvent = Event & {
  prompt: () => Promise<unknown>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable'

export type InstallPromptStore = {
  /** Starts listening on `target` (the window); returns the stop function. */
  capture: (target: EventTarget) => () => void
  available: () => boolean
  subscribe: (listener: () => void) => () => void
  /** Shows the browser's install dialog; an offer is used once. */
  prompt: () => Promise<InstallOutcome>
}

function isInstallPromptEvent(event: Event): event is InstallPromptEvent {
  const candidate = event as Partial<InstallPromptEvent>
  return typeof candidate.prompt === 'function' && candidate.userChoice instanceof Promise
}

export function createInstallPromptStore(): InstallPromptStore {
  let offer: InstallPromptEvent | null = null
  const listeners = new Set<() => void>()
  const set = (next: InstallPromptEvent | null): void => {
    offer = next
    for (const listener of listeners) listener()
  }
  return {
    capture(target) {
      const onOffer = (event: Event): void => {
        if (!isInstallPromptEvent(event)) return
        // The browser's own mini-infobar stays away; the menu entry offers installation instead.
        event.preventDefault()
        set(event)
      }
      const onInstalled = (): void => {
        set(null)
      }
      target.addEventListener('beforeinstallprompt', onOffer)
      target.addEventListener('appinstalled', onInstalled)
      return () => {
        target.removeEventListener('beforeinstallprompt', onOffer)
        target.removeEventListener('appinstalled', onInstalled)
      }
    },
    available: () => offer !== null,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    async prompt() {
      const current = offer
      if (!current) return 'unavailable'
      set(null)
      await current.prompt()
      return (await current.userChoice).outcome
    },
  }
}

/** The app's one store. */
export const installPromptStore = createInstallPromptStore()

/** Opens the browser's install dialog of the app's store (the menu entry's click). */
export function promptInstall(): void {
  void installPromptStore.prompt()
}

/** Whether the browser currently offers installation (a server's store never captures an offer, so it answers false). */
export function useInstallAvailable(store: InstallPromptStore = installPromptStore): boolean {
  return React.useSyncExternalStore(store.subscribe, store.available, store.available)
}

/** The label of the menu entry; without a provider the menu shows no entry. */
export const MemberInstallLabelContext = React.createContext<string | null>(null)
