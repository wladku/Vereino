import { describe, expect, it } from '@jest/globals'
import { FOUNDATION_CLUB_TABLES } from '../club-tables'

describe('FOUNDATION_CLUB_TABLES', () => {
  it('lists only tables the module owns, each once (many clubs spec phase 4, #632)', () => {
    expect(FOUNDATION_CLUB_TABLES.length).toBeGreaterThan(0)
    // `vereino_identity_links` keeps the name the social sign-in spec gives it (DD-S03, D-027).
    for (const table of FOUNDATION_CLUB_TABLES)
      expect(table.startsWith('foundation_') || table === 'vereino_identity_links').toBe(true)
    expect(FOUNDATION_CLUB_TABLES).toContain('vereino_identity_links')
    expect(new Set(FOUNDATION_CLUB_TABLES).size).toBe(FOUNDATION_CLUB_TABLES.length)
  })
})
