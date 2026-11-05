import { describe, expect, it } from '@jest/globals'
import { publicCatalogBlock, type PublicGroupRow } from '../public-catalog'

const swimming: PublicGroupRow = {
  id: 'g1',
  name: 'Pływanie — początkujący',
  kind: 'class_group',
  publicDescription: 'Nauka pływania.',
  publicConditions: 'Strój i czepek.',
  ageFrom: 6,
  ageTo: 9,
  levelLabel: 'początkujący',
}
const advanced: PublicGroupRow = {
  id: 'g2',
  name: 'Pływanie — zaawansowani',
  kind: 'team',
  publicDescription: '  ',
  publicConditions: null,
  ageFrom: 10,
  ageTo: null,
  levelLabel: null,
}

describe('publicCatalogBlock', () => {
  it('leaves the block out for a section without public groups', () => {
    expect(publicCatalogBlock([], { conditions: true, coaches: true }, new Map(), new Map())).toBeNull()
  })

  it('shows the group fields only, without conditions or instructors when their blocks are off', () => {
    const block = publicCatalogBlock([swimming, advanced], { conditions: false, coaches: false }, new Map(), new Map())
    expect(block).toEqual({
      items: [
        {
          id: 'g1',
          name: 'Pływanie — początkujący',
          kind: 'class_group',
          description: 'Nauka pływania.',
          ageFrom: 6,
          ageTo: 9,
          level: 'początkujący',
        },
        {
          id: 'g2',
          name: 'Pływanie — zaawansowani',
          kind: 'team',
          description: null,
          ageFrom: 10,
          ageTo: null,
          level: null,
        },
      ],
    })
    expect(JSON.stringify(block)).not.toContain('Strój')
  })

  it('names an instructor only with consent and keeps an anonymous one without it', () => {
    const block = publicCatalogBlock(
      [swimming, advanced],
      { conditions: true, coaches: true },
      new Map([['g1', ['p-anna', 'p-jan']]]),
      new Map([['p-anna', 'Anna K.']]),
    )
    expect(block?.items[0]).toMatchObject({
      conditions: 'Strój i czepek.',
      instructors: [{ name: 'Anna K.' }, { name: null }],
    })
    expect(block?.items[1]).toMatchObject({ conditions: null, instructors: [] })
  })
})
