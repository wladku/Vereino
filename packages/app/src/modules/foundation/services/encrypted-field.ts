// P-09 encryptedField (V-3, DD-38, S5.6): one declaration yields the module's `encryption.ts` map entry (with the
// `<field>_hash` sibling the platform fills with `hashForLookup`), the equality-lookup candidates for that
// sibling and the field's search policy.
import { lookupHashCandidates } from '@open-mercato/shared/lib/encryption/aes'
import type { ModuleEncryptionFieldRule } from '@open-mercato/shared/modules/encryption'
import type { SearchFieldPolicy } from '@open-mercato/shared/modules/search'

type FieldBase = {
  /** Colon-form entity id, e.g. `people:person`. */
  entityId: string
  /** Column name as the encryption map names it, e.g. `pesel`. */
  field: string
}

/** A hashed field is never searchable: its value must not reach a search index (DD-38). */
export type HashedEncryptedField = FieldBase & { hash: true; searchable?: false }
export type PlainEncryptedField = FieldBase & { hash?: false; searchable?: boolean }

type DeclarationBase = {
  entityId: string
  /** Entry for the module's `defaultEncryptionMaps` fields list. */
  mapEntry: ModuleEncryptionFieldRule
  /** Fields of this declaration for the entity's `searchConfig` `fieldPolicy`. */
  searchPolicy: SearchFieldPolicy
}

export type HashedEncryptedFieldDeclaration = DeclarationBase & {
  hashField: string
  /** Candidate hashes of `value` for an equality filter on `hashField` (current and legacy hash). */
  lookup(value: string): string[]
}

export type PlainEncryptedFieldDeclaration = DeclarationBase & { hashField: null }

export function encryptedField(declaration: HashedEncryptedField): HashedEncryptedFieldDeclaration
export function encryptedField(declaration: PlainEncryptedField): PlainEncryptedFieldDeclaration
export function encryptedField(
  declaration: HashedEncryptedField | PlainEncryptedField,
): HashedEncryptedFieldDeclaration | PlainEncryptedFieldDeclaration {
  const { entityId, field } = declaration
  if (declaration.hash) {
    const hashField = `${field}_hash`
    return {
      entityId,
      hashField,
      mapEntry: { field, hashField },
      searchPolicy: { excluded: [field, hashField] },
      lookup: (value: string) => lookupHashCandidates(value),
    }
  }
  return {
    entityId,
    hashField: null,
    mapEntry: { field },
    searchPolicy: declaration.searchable ? { searchable: [field] } : { excluded: [field] },
  }
}
