// The browser's install offer of the installable app (D-045, E31-S01 #873). Chrome can fire `beforeinstallprompt`
// before the app hydrates, and only once per page load, so an inline head script keeps the offer on `window` under
// this key until the member menu's store (`installPromptStore` of `@vereino/ui`) adopts it. Pure constants: the root
// layout (a server component) and the client store share them.

/** Where the early script keeps an offer the browser fired before the app hydrated. */
export const EARLY_INSTALL_OFFER_KEY = '__vereinoInstallOffer'

/** The inline head script: prevents the browser's mini-infobar and keeps the offer. */
export const EARLY_INSTALL_OFFER_SCRIPT = `window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.${EARLY_INSTALL_OFFER_KEY}=e})`
