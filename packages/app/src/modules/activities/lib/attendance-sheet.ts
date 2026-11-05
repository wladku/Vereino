// The coach's attendance list in one tap (E06-S17 #99; README M-05, flow F-03 path B; REQ-007, REQ-008; R11): the
// quick fill "All declared present", what closing records (an unmarked person is recorded `absent`, so the actual
// attendance is always complete), the close summary and the present count of a closed list. Pure and framework-free;
// the page keeps the coach's selections and the server keeps authorization and the session version.

export type SheetActual = 'present' | 'absent' | 'late'

/** The fields of an attendance-list row the sheet reads. */
export type SheetRow = {
  readonly personId: string
  readonly declared: 'yes' | 'no' | 'unknown' | null
  readonly declarationStatus: 'final' | 'pending_guardian' | 'rejected_by_guardian' | null
  readonly actual: SheetActual | null
}

/** The mark the page shows for a row: the coach's selection when there is one, otherwise the saved mark. */
export type CurrentMark<R extends SheetRow = SheetRow> = (row: R) => SheetActual | null

export type SheetEntry = { personId: string; actual: SheetActual | null }

/** A "yes" that counts: a final declaration (a pending or rejected one is not a declared attendance). */
export function declaredYes(row: SheetRow): boolean {
  return row.declared === 'yes' && row.declarationStatus === 'final'
}

/** "All declared present": the persons declared "yes" who have no mark yet; everyone else stays as they are. */
export function declaredPresentFill<R extends SheetRow>(rows: readonly R[], current: CurrentMark<R>): string[] {
  return rows.filter((row) => declaredYes(row) && current(row) === null).map((row) => row.personId)
}

/** The persons without a mark; closing records them `absent` (R11). */
export function unmarkedPersonIds<R extends SheetRow>(rows: readonly R[], current: CurrentMark<R>): string[] {
  return rows.filter((row) => current(row) === null).map((row) => row.personId)
}

/**
 * The entries a save sends: every mark that differs from the saved one; when the save closes the session, every
 * unmarked person is also sent as `absent`.
 */
export function sheetEntries<R extends SheetRow>(
  rows: readonly R[],
  current: CurrentMark<R>,
  complete: boolean,
): SheetEntry[] {
  const entries: SheetEntry[] = []
  for (const row of rows) {
    const mark = current(row)
    if (complete && mark === null) entries.push({ personId: row.personId, actual: 'absent' })
    else if (mark !== row.actual) entries.push({ personId: row.personId, actual: mark })
  }
  return entries
}

/** The session has not ended yet (it is still running, or has not started): closing it early needs a warning. */
export function closesEarly(endAt: string, now: Date): boolean {
  return now.getTime() < new Date(endAt).getTime()
}

/** The persons who came: `present` and `late` (the "{n} present" of the close toast). */
export function presentCount(rows: readonly Pick<SheetRow, 'actual'>[]): number {
  return rows.filter((row) => row.actual === 'present' || row.actual === 'late').length
}

/** Ctrl+Enter or Cmd+Enter (the club spec's UI architecture: it closes the session after the confirmation). */
export function isCloseShortcut(event: { readonly key: string; readonly ctrlKey: boolean; readonly metaKey: boolean }) {
  return event.key === 'Enter' && (event.ctrlKey || event.metaKey)
}

/** A coordinator or the club administrator manages the roster, so the empty list links to it. */
export function seesRosterLink(actingRole: string): boolean {
  return actingRole === 'coordinator' || actingRole === 'club_admin'
}

/** The group record, whose first tab is the roster (`/backend/groups/groups/[id]`). */
export function groupRosterHref(groupId: string): string {
  return `/backend/groups/groups/${encodeURIComponent(groupId)}`
}
