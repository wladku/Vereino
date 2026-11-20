// Search of `people` (foundation spec P-09, DD-38; TEST-F06): persons are found by name through the platform's hashed
// `search_tokens`; the PESEL, its hash, the e-mail, phone and notes never reach an external provider.
import type { SearchIndexSource, SearchModuleConfig, SearchResultPresenter } from '@open-mercato/shared/modules/search'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import {
  PERSON_ENTITY_ID,
  personEmail,
  personExternalId,
  personFirstName,
  personLastName,
  personNotes,
  personPesel,
  personPhone,
} from './encryption'

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

async function presenter(record: Record<string, unknown>): Promise<SearchResultPresenter> {
  const { t } = await resolveTranslations()
  // An anonymised person (#308) reads "Former member": a name kept under the retention hold is never shown here.
  const name = record.anonymized_at
    ? t('people.person.formerMember', 'Former member')
    : [text(record.first_name), text(record.last_name)].filter(Boolean).join(' ')
  return { title: name || text(record.id), icon: 'user', badge: t('people.search.person.badge', 'Person') }
}

/**
 * Every searchable person field is encrypted, so nothing goes to the fuzzy/vector strategies; persons are reachable
 * through `search_tokens`, which the query indexer builds from the decrypted index document.
 */
function buildSource(): Promise<SearchIndexSource | null> {
  return Promise.resolve(null)
}

export const searchConfig: SearchModuleConfig = {
  entities: [
    {
      entityId: PERSON_ENTITY_ID,
      enabled: true,
      priority: 5,
      aclFeatures: ['people.view'],
      buildSource,
      formatResult: (ctx) => presenter(ctx.record),
      fieldPolicy: {
        excluded: [
          personFirstName,
          personLastName,
          personEmail,
          personPhone,
          personNotes,
          personPesel,
          personExternalId,
        ].flatMap((declaration) => declaration.searchPolicy.excluded ?? []),
      },
    },
  ],
}

export default searchConfig
export const config = searchConfig
