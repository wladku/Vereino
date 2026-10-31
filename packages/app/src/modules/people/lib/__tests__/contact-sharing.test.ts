// REQ-037 / AC5 of #34: only a live person with the consent and an account shares contact details with coaches.
import { describe, expect, it } from '@jest/globals'
import { contactSharingFilter } from '../contact-sharing'

describe('contactSharingFilter', () => {
  it('requires the consent, an account and a live row in the organization, for the unique ids', () => {
    expect(contactSharingFilter({ tenantId: 't', organizationId: 'o' }, ['a', 'b', 'a'])).toEqual({
      id: { $in: ['a', 'b'] },
      tenantId: 't',
      organizationId: 'o',
      deletedAt: null,
      shareContactWithCoachesAt: { $ne: null },
      userId: { $ne: null },
    })
  })
})
