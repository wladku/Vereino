// The model behind `ConsentToggle` (foundation primitives spec phase A2 `ConsentToggle`, built with its second consumer
// by the event photos spec, #871 — owner decision on #857): a consent switch that saves at once, asks before a
// withdrawal, and keeps the stored value when the save fails (the page shows the error and the switch stays as it was).

/** What a change of the switch ended in. */
export type ConsentToggleOutcome = { status: 'saved' } | { status: 'cancelled' } | { status: 'failed'; error: unknown }

/**
 * Runs one change of a consent: a withdrawal (`next === false`) first asks `confirmWithdrawal` when given and stops on
 * a refusal; then `save(next)`. A thrown save is a `failed` outcome carrying the error, never a throw.
 */
export async function changeConsent(input: {
  next: boolean
  confirmWithdrawal?: () => Promise<boolean>
  save: (next: boolean) => Promise<void>
}): Promise<ConsentToggleOutcome> {
  if (!input.next && input.confirmWithdrawal && !(await input.confirmWithdrawal())) return { status: 'cancelled' }
  try {
    await input.save(input.next)
    return { status: 'saved' }
  } catch (error: unknown) {
    return { status: 'failed', error }
  }
}
