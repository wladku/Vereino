import { describe, expect, it } from '@jest/globals'
import { platformFlashText } from '@/lib/platform-flash'

describe('platformFlashText', () => {
  it('names the missing permission in the page language', () => {
    expect(
      platformFlashText(
        'Access denied: you are missing the required permission "payments.groups.view". Contact your administrator.',
      ),
    ).toEqual({ key: 'vereino.flash.accessDeniedFeature', params: { features: 'payments.groups.view' } })
  })

  it('turns the default-role and the generic refusal into the plain "no permission" text', () => {
    expect(
      platformFlashText('Access denied: this area requires the role "admin". Contact your administrator.'),
    ).toEqual({ key: 'vereino.flash.accessDenied' })
    expect(platformFlashText('Access denied: you do not have permission to perform this action.')).toEqual({
      key: 'vereino.flash.accessDenied',
    })
  })

  it('translates the session refresh notice', () => {
    expect(platformFlashText('Session expired. Redirecting to sign in…')).toEqual({ key: 'vereino.flash.sessionExpired' })
  })

  it('leaves every other text alone', () => {
    expect(platformFlashText('Zapisano')).toBeNull()
    expect(platformFlashText('Access denied: something else')).toBeNull()
  })
})
