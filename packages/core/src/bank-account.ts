// Polish bank accounts — an institution's (README B-07, #87) and the club's own (#111, shown in the payers' transfer
// instructions): an NRB — 26 digits, typed with or without spaces and an
// optional `PL` country prefix — stored as the 26 digits and shown in the usual 2 + 6 × 4 grouping. Pure.

const NRB_DIGITS = 26
const NRB_PATTERN = /^\d{26}$/

/** The 26 digits of an NRB, or null when `value` is not one (spaces and a leading `PL` are ignored). */
export function normalizeBankAccount(value: string): string | null {
  const compact = value.replace(/\s+/g, '').replace(/^PL/i, '')
  return NRB_PATTERN.test(compact) ? compact : null
}

/** An NRB in its printed form, `61 1090 1014 0000 0712 1981 2874`; any other value is returned unchanged. */
export function formatBankAccount(value: string): string {
  const digits = normalizeBankAccount(value)
  if (!digits) return value
  const groups = [digits.slice(0, 2)]
  for (let start = 2; start < NRB_DIGITS; start += 4) groups.push(digits.slice(start, start + 4))
  return groups.join(' ')
}
