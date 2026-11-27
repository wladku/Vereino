// Who sees which applications (sign-up form spec BR-J5, REQ-J10, REQ-J17; #799): a club administrator every section, a
// coordinator the sections of their `coordinator` grants. Pure: the grants come from the scope contract.
import type { Scope } from '@vereino/core'

/** `all` for a club administrator, else the coordinated section ids (empty: none). */
export function deciderSections(scope: Scope): 'all' | string[] {
  if (scope.some((grant) => grant.kind === 'club_admin')) return 'all'
  const ids = new Set<string>()
  for (const grant of scope) {
    if (grant.kind !== 'coordinator') continue
    for (const id of grant.ids ?? []) ids.add(id)
  }
  return [...ids].sort()
}

/** Whether the caller decides applications of `sectionId`. */
export function decidesSection(sections: 'all' | readonly string[], sectionId: string): boolean {
  return sections === 'all' || sections.includes(sectionId)
}

/** The acting role a read is recorded with: `club_admin` for every section, else `coordinator`. */
export function readerRole(sections: 'all' | readonly string[]): 'coordinator' | 'club_admin' {
  return sections === 'all' ? 'club_admin' : 'coordinator'
}
