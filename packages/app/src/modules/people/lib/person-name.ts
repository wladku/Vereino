// The prefill of the in-place person create (people life-cycle spec REQ-L14, picker row 3): a guardian search such as
// "Kasia Kowalska" that found nobody becomes the first and the last name of the new person. The first word is the
// first name and the rest the last name ("Anna Maria Nowak" → "Anna", "Maria Nowak" is not guessed apart: the user
// corrects it in the dialog); a single word is taken as the last name, which is what the guardian search matches.

export type PersonNameDraft = { firstName: string; lastName: string }

export function splitPersonName(term: string | null | undefined): PersonNameDraft {
  const [first, ...rest] = (term ?? '').trim().split(/\s+/)
  if (rest.length === 0) return { firstName: '', lastName: first }
  return { firstName: first, lastName: rest.join(' ') }
}
