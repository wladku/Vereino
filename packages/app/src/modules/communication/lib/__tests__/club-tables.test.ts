import { describe, expect, it } from '@jest/globals'
import { COMMUNICATION_CLUB_TABLES } from '../club-tables'

describe('COMMUNICATION_CLUB_TABLES', () => {
  it('lists only tables the module owns, each once (many clubs spec phase 4, #632)', () => {
    expect(COMMUNICATION_CLUB_TABLES.length).toBeGreaterThan(0)
    for (const table of COMMUNICATION_CLUB_TABLES) expect(table.startsWith('communication_')).toBe(true)
    expect(new Set(COMMUNICATION_CLUB_TABLES).size).toBe(COMMUNICATION_CLUB_TABLES.length)
  })
})
