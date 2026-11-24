import { describe, expect, it } from '@jest/globals'
import { ACTIVITIES_CLUB_TABLES } from '../club-tables'

describe('ACTIVITIES_CLUB_TABLES', () => {
  it('lists only tables the module owns, each once (many clubs spec phase 4, #632)', () => {
    expect(ACTIVITIES_CLUB_TABLES.length).toBeGreaterThan(0)
    for (const table of ACTIVITIES_CLUB_TABLES) expect(table.startsWith('activities_')).toBe(true)
    expect(new Set(ACTIVITIES_CLUB_TABLES).size).toBe(ACTIVITIES_CLUB_TABLES.length)
  })
})
