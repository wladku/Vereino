// The `club_core` part of the person data export (person data export spec
// `.ai/specs/implemented/2026-11-21-vereino-person-data-export.md`, *Contributor inventory* → `club_core`; #527, phase X2): how
// one of the subject's `club_core_contracts` rows (`party_type='person'`) is shown — its own id, the kind, the period,
// the decrypted terms read as `lib/contracts.ts` reads them, and the signed PDF as metadata only (A-7: the binary is
// never in the file). A person's contract names no other person, so the part has no actor counts.
import type { CalendarDate } from '@vereino/core'
import { parseContractTerms, type CoachTerms, type FacilityTerms } from './contracts'

export const CLUB_CORE_EXPORT_MODULE = 'club_core' as const
export const CLUB_CORE_CONTRACTS_TABLE = 'club_core_contracts' as const
/** RoPA A11 — staff contracts (`docs/compliance/ropa.md`). */
export const CLUB_CORE_CONTRACTS_ACTIVITY = 'A11' as const

export type ContractExportSource = {
  id: string
  kind: string
  validFrom: CalendarDate
  validTo?: CalendarDate | null
  /** Decrypted JSON text. */
  terms?: string | null
  attachmentId?: string | null
  createdAt?: Date | null
  updatedAt?: Date | null
}

export type ContractExportRow = {
  id: string
  kind: string
  validFrom: CalendarDate
  validTo: CalendarDate | null
  terms: CoachTerms | FacilityTerms | null
  attachment: { attachmentId: string } | null
  createdAt: string | null
  updatedAt: string | null
}

/** One contract of the subject as the file shows it. */
export function contractExportRow(row: ContractExportSource): ContractExportRow {
  return {
    id: row.id,
    kind: row.kind,
    validFrom: row.validFrom,
    validTo: row.validTo ?? null,
    terms: parseContractTerms(row.kind, row.terms ?? null),
    attachment: row.attachmentId ? { attachmentId: row.attachmentId } : null,
    createdAt: row.createdAt ? row.createdAt.toISOString() : null,
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
  }
}
