import { describe, expect, it } from '@jest/globals'
import { FACILITIES_CLUB_TABLES } from '../club-tables'

describe('FACILITIES_CLUB_TABLES', () => {
  it('lists only tables the module owns, each once (many clubs spec phase 4, #632)', () => {
    expect(FACILITIES_CLUB_TABLES.length).toBeGreaterThan(0)
    for (const table of FACILITIES_CLUB_TABLES) expect(table.startsWith('facilities_')).toBe(true)
    expect(new Set(FACILITIES_CLUB_TABLES).size).toBe(FACILITIES_CLUB_TABLES.length)
  })
})
