// The early install-offer script (D-045, #873): it keeps the offer under the shared key and stops the mini-infobar.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EARLY_INSTALL_OFFER_KEY, EARLY_INSTALL_OFFER_SCRIPT } from '../install-offer.ts'

test('the early script prevents the mini-infobar and keeps the offer on window', () => {
  const window = new EventTarget()
  new Function('window', EARLY_INSTALL_OFFER_SCRIPT)(window)
  const offer = new Event('beforeinstallprompt', { cancelable: true })
  window.dispatchEvent(offer)
  assert.equal(offer.defaultPrevented, true)
  assert.equal(window[EARLY_INSTALL_OFFER_KEY], offer)
  assert.equal(EARLY_INSTALL_OFFER_KEY, '__vereinoInstallOffer')
})
