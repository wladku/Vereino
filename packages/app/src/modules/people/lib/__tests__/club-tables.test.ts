import { describe, expect, it } from '@jest/globals'
import { PEOPLE_CLUB_TABLES } from '../club-tables'

describe('PEOPLE_CLUB_TABLES', () => {
  it('lists only tables the module owns, each once (many clubs spec phase 4, #632)', () => {
    expect(PEOPLE_CLUB_TABLES.length).toBeGreaterThan(0)
    for (const table of PEOPLE_CLUB_TABLES) expect(table.startsWith('people_')).toBe(true)
    expect(new Set(PEOPLE_CLUB_TABLES).size).toBe(PEOPLE_CLUB_TABLES.length)
  })
})
