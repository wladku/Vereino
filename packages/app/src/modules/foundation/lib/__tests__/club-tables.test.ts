import { describe, expect, it } from '@jest/globals'
import { FOUNDATION_CLUB_TABLES } from '../club-tables'

describe('FOUNDATION_CLUB_TABLES', () => {
  it('lists only tables the module owns, each once (many clubs spec phase 4, #632)', () => {
    expect(FOUNDATION_CLUB_TABLES.length).toBeGreaterThan(0)
    for (const table of FOUNDATION_CLUB_TABLES) expect(table.startsWith('foundation_')).toBe(true)
    expect(new Set(FOUNDATION_CLUB_TABLES).size).toBe(FOUNDATION_CLUB_TABLES.length)
  })
})
