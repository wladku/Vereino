import { describe, expect, it } from '@jest/globals'
import { splitPersonName } from '../person-name'

describe('splitPersonName (REQ-L14 in-place person prefill)', () => {
  it('takes the first word as the first name and the rest as the last name', () => {
    expect(splitPersonName(' Kasia   Kowalska ')).toEqual({ firstName: 'Kasia', lastName: 'Kowalska' })
    expect(splitPersonName('Anna Maria Nowak')).toEqual({ firstName: 'Anna', lastName: 'Maria Nowak' })
  })

  it('takes a single word as the last name, which the guardian search matches', () => {
    expect(splitPersonName('Kowalska')).toEqual({ firstName: '', lastName: 'Kowalska' })
  })

  it('leaves both empty without a term', () => {
    expect(splitPersonName('   ')).toEqual({ firstName: '', lastName: '' })
    expect(splitPersonName(null)).toEqual({ firstName: '', lastName: '' })
    expect(splitPersonName(undefined)).toEqual({ firstName: '', lastName: '' })
  })
})
