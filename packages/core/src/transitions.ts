// P-25 transition tables (foundation II DD-G04): a forward-only status declared once as data — its states, the states
// a record may be created in, the allowed moves and the terminal states. Commands ask `canTransition` before they
// write; the `foundation` service turns a refused move into 409 `invalid_transition`.

export type TransitionTable<TState extends string> = {
  readonly states: readonly TState[]
  /** States a new record may start in. */
  readonly entry: readonly TState[]
  /** Allowed moves `[from, to]`. */
  readonly transitions: ReadonlyArray<readonly [TState, TState]>
  /** States without an outgoing move. */
  readonly terminal: readonly TState[]
}

export type Transitions<TState extends string> = {
  readonly table: TransitionTable<TState>
  /** True when the table allows the move; unknown states never move. */
  canTransition(from: string, to: string): boolean
  isTerminal(state: string): boolean
  isEntry(state: string): boolean
}

/**
 * Checks a table once, at module load: every state it names is declared, there is at least one entry state, and no
 * terminal state has an outgoing move. A malformed table is a programming error (`RangeError`).
 */
export function defineTransitions<const TState extends string>(table: TransitionTable<TState>): Transitions<TState> {
  const states = new Set<string>(table.states)
  const named = [...table.entry, ...table.terminal, ...table.transitions.flat()]
  const unknown = named.find((state) => !states.has(state))
  if (unknown !== undefined) throw new RangeError(`[internal] transition table names an unknown state: ${unknown}`)
  if (table.entry.length === 0) throw new RangeError('[internal] transition table needs an entry state')
  const leaving = table.transitions.find(([from]) => table.terminal.includes(from))
  if (leaving) throw new RangeError(`[internal] terminal state ${leaving[0]} has an outgoing transition`)
  const moves = new Set(table.transitions.map(([from, to]) => `${from}→${to}`))
  return {
    table,
    canTransition: (from, to) => moves.has(`${from}→${to}`),
    isTerminal: (state) => (table.terminal as readonly string[]).includes(state),
    isEntry: (state) => (table.entry as readonly string[]).includes(state),
  }
}
