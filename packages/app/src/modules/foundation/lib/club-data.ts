// The tables a Vereino module holds for a club (many clubs spec phase 4, REQ-M06, DD-M09; #632). Every module
// registers its list under the optional DI tokens `club_core.clubExport.<module>` and `club_core.clubDelete.<module>`;
// `club_core export-club` and `delete-club` read them with `hasRegistration`, so `club_core` never imports another
// business module and a module's tables are named by the module that owns them. Pure: no database, no container.

/** A module's tables keyed by `tenant_id`: exported, deleted and restored as "every row of the club's tenant". */
export type ClubDataContributor = {
  /** Owning module id, e.g. `payments`; the archive holds the rows in `data/<module>.json`. */
  module: string
  /** Table names, each with a `tenant_id` column. */
  tables: readonly string[]
}

const IDENTIFIER = /^[a-z][a-z0-9_]*$/

/** DI token of a module's export contributor, e.g. `club_core.clubExport.payments`. */
export function clubExportContributorToken(module: string): string {
  return `club_core.clubExport.${module}`
}

/** DI token of a module's deletion contributor, e.g. `club_core.clubDelete.payments`. */
export function clubDeleteContributorToken(module: string): string {
  return `club_core.clubDelete.${module}`
}

/**
 * DI token of a module's deletion of a club's rows held outside the club's tenant, e.g.
 * `club_core.clubDeleteBeyondTenant.training` (the shared outline library, training outlines spec *Events* → club
 * offboarding; #685). Optional: `club_core delete-club` runs it in its own transaction when it is registered.
 */
export function clubDeleteBeyondTenantToken(module: string): string {
  return `club_core.clubDeleteBeyondTenant.${module}`
}

/**
 * Declares a module's club tables. Throws on a malformed module id or table name, an empty list or a table listed
 * twice, so a typo fails when the module loads instead of leaving a table behind at deletion.
 */
export function clubDataContributor(module: string, tables: readonly string[]): ClubDataContributor {
  if (!IDENTIFIER.test(module)) throw new Error(`[internal] club data contributor, invalid module id: ${module}`)
  if (tables.length === 0) throw new Error(`[internal] club data contributor without tables: ${module}`)
  for (const table of tables) {
    if (!IDENTIFIER.test(table)) {
      throw new Error(`[internal] club data contributor, invalid table: ${[module, table].join(' / ')}`)
    }
  }
  if (new Set(tables).size !== tables.length) {
    throw new Error(`[internal] club data contributor lists a table twice: ${module}`)
  }
  return Object.freeze({ module, tables: Object.freeze([...tables]) })
}
