import { describe, expect, it } from '@jest/globals'
import { TRAINING_CLUB_TABLES } from '../club-tables'

describe('TRAINING_CLUB_TABLES', () => {
  it('lists only tables the module owns, each once (many clubs spec phase 4)', () => {
    expect(TRAINING_CLUB_TABLES).toEqual([
      'training_outlines',
      'training_authors',
      'training_library_entries',
      'training_library_ratings',
      'training_library_uses',
      'training_library_reports',
    ])
    expect(new Set(TRAINING_CLUB_TABLES).size).toBe(TRAINING_CLUB_TABLES.length)
  })
})
