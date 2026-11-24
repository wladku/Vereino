import { describe, expect, it } from '@jest/globals'
import { CLUB_CORE_CLUB_TABLES } from '../club-tables'

describe('CLUB_CORE_CLUB_TABLES', () => {
  it('lists only tables the module owns, each once (many clubs spec phase 4, #632)', () => {
    expect(CLUB_CORE_CLUB_TABLES.length).toBeGreaterThan(0)
    for (const table of CLUB_CORE_CLUB_TABLES) expect(table.startsWith('club_core_')).toBe(true)
    expect(new Set(CLUB_CORE_CLUB_TABLES).size).toBe(CLUB_CORE_CLUB_TABLES.length)
  })
})
