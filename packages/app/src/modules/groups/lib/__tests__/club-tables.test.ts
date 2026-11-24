import { describe, expect, it } from '@jest/globals'
import { GROUPS_CLUB_TABLES } from '../club-tables'

describe('GROUPS_CLUB_TABLES', () => {
  it('lists only tables the module owns, each once (many clubs spec phase 4, #632)', () => {
    expect(GROUPS_CLUB_TABLES.length).toBeGreaterThan(0)
    for (const table of GROUPS_CLUB_TABLES) expect(table.startsWith('groups_')).toBe(true)
    expect(new Set(GROUPS_CLUB_TABLES).size).toBe(GROUPS_CLUB_TABLES.length)
  })
})
