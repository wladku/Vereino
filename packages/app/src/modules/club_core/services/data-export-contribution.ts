// The `club_core` person data export contributor (person data export spec
// `.ai/specs/2026-11-21-vereino-person-data-export.md`, DD-X01, *Contributor inventory* → `club_core`; #527, phase X2):
// `people` declares the contract (`people/services/data-export.ts`) and reads it with `hasRegistration`; `club_core`
// registers it in `di.ts` under `people.dataExport.club_core`. The part is the subject's live contracts
// (`party_type='person'`), terms decrypted, the signed PDF as metadata only. Every query filters by the subject's
// tenant and organization.
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { PersonDataExportContributor } from '../../people/services/data-export'
import { Contract } from '../data/entities'
import {
  CLUB_CORE_CONTRACTS_ACTIVITY,
  CLUB_CORE_CONTRACTS_TABLE,
  CLUB_CORE_EXPORT_MODULE,
  contractExportRow,
} from '../lib/data-export'

/** The token `people` reads (`dataExportContributorToken('club_core')` in `people/services/data-export.ts`). */
export const CLUB_CORE_DATA_EXPORT_CONTRIBUTOR = 'people.dataExport.club_core'

export const dataExportContribution: PersonDataExportContributor = {
  async export(em, subject) {
    const scope = { tenantId: subject.tenantId, organizationId: subject.organizationId }
    const contracts = await findWithDecryption(
      em,
      Contract,
      { ...scope, partyType: 'person', partyId: subject.personId, deletedAt: null },
      { orderBy: { validFrom: 'asc', id: 'asc' } },
      scope,
    )
    return {
      sections: [
        {
          module: CLUB_CORE_EXPORT_MODULE,
          table: CLUB_CORE_CONTRACTS_TABLE,
          activity: CLUB_CORE_CONTRACTS_ACTIVITY,
          // The terms of a contract the person concluded with the club (art. 20(1)(a), contract).
          portable: true,
          rows: contracts.map(contractExportRow),
        },
      ],
      actorCounts: [],
    }
  },
}
