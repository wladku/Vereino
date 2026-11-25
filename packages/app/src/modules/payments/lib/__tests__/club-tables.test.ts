import { describe, expect, it } from '@jest/globals'
import { PAYMENTS_CLUB_TABLES } from '../club-tables'

describe('PAYMENTS_CLUB_TABLES', () => {
  it('lists only tables the module owns, each once (many clubs spec phase 4, #632)', () => {
    expect(PAYMENTS_CLUB_TABLES.length).toBeGreaterThan(0)
    for (const table of PAYMENTS_CLUB_TABLES) expect(table.startsWith('payments_')).toBe(true)
    expect(new Set(PAYMENTS_CLUB_TABLES).size).toBe(PAYMENTS_CLUB_TABLES.length)
  })
})
