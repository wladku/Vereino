// The default privacy notice of a club (E19-S03, #469; engineering standards S9.2, S9.3, S9.7): the text a guest reads
// on `/p/[clubSlug]/privacy` while the club has not set the address of its own privacy policy on B-03 (#195). It is
// written from the records of processing (`docs/compliance/ropa.md`), the processor register (`processors.md`) and the
// retention schedule (`retention.md`); the words live in the `club_core.privacy.*` catalog keys of each language, and
// this file only says which keys make up each section and in what order. A section is a heading, paragraphs before a
// list, the list and paragraphs after it. The short version for children and teenagers is one more section.

export type PrivacyNoticeSection = {
  id: string
  /** Paragraphs before the list. */
  lead: number
  /** List items. */
  items: number
  /** Paragraphs after the list. */
  notes: number
}

/** The sections of the full notice, in reading order. */
export const PRIVACY_NOTICE_SECTIONS: readonly PrivacyNoticeSection[] = [
  { id: 'controller', lead: 2, items: 0, notes: 0 },
  { id: 'data', lead: 1, items: 7, notes: 1 },
  { id: 'purposes', lead: 0, items: 4, notes: 1 },
  { id: 'children', lead: 2, items: 0, notes: 0 },
  { id: 'recipients', lead: 0, items: 4, notes: 1 },
  { id: 'retention', lead: 0, items: 4, notes: 0 },
  { id: 'rights', lead: 1, items: 6, notes: 2 },
  { id: 'cookies', lead: 1, items: 0, notes: 0 },
  { id: 'changes', lead: 1, items: 0, notes: 0 },
]

/** The short version for children and teenagers (GDPR art. 12(1), S9.3), shown after the full notice. */
export const PRIVACY_NOTICE_CHILDREN: PrivacyNoticeSection = { id: 'kids', lead: 1, items: 6, notes: 0 }

/** The keys of the page around the sections. */
export const PRIVACY_NOTICE_PAGE_KEYS = {
  title: 'club_core.privacy.title',
  intro: 'club_core.privacy.intro',
  childrenLink: 'club_core.privacy.childrenLink',
  ownMessage: 'club_core.privacy.own.message',
  ownLink: 'club_core.privacy.own.link',
  description: 'club_core.privacy.meta.description',
} as const

export type PrivacyNoticeSectionKeys = { title: string; lead: string[]; items: string[]; notes: string[] }

const numbered = (base: string, part: string, count: number): string[] =>
  Array.from({ length: count }, (_, index) => `${base}.${part}${String(index + 1)}`)

/** The catalog keys of one section: `club_core.privacy.<id>.title`, `.lead1…`, `.item1…`, `.note1…`. */
export function privacySectionKeys(section: PrivacyNoticeSection): PrivacyNoticeSectionKeys {
  const base = `club_core.privacy.${section.id}`
  return {
    title: `${base}.title`,
    lead: numbered(base, 'lead', section.lead),
    items: numbered(base, 'item', section.items),
    notes: numbered(base, 'note', section.notes),
  }
}

/** Every catalog key the notice page uses, so a test can check both languages hold them all. */
export function privacyNoticeKeys(): string[] {
  const sectionKeys = [...PRIVACY_NOTICE_SECTIONS, PRIVACY_NOTICE_CHILDREN].flatMap((section) => {
    const keys = privacySectionKeys(section)
    return [keys.title, ...keys.lead, ...keys.items, ...keys.notes]
  })
  return [...Object.values(PRIVACY_NOTICE_PAGE_KEYS), ...sectionKeys]
}
