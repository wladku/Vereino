// P-28 the `append_only` guard (foundation II DD-G11): the rule of a MikroORM event subscriber that refuses an update or
// a delete of an append-only row through the unit of work. Pure: the caller passes how to recognise a row and what to
// throw, so the rule is tested without the platform or the ORM; `services/append-only-guard.ts` registers it as a
// subscriber with `@vereino/db` and the foundation's error table. `nativeUpdate` / `nativeDelete` bypass ORM events —
// no module issues them against a log.

/** The part of the ORM's event arguments the guard reads. */
export type GuardEventArgs = { readonly entity: unknown; readonly meta?: { readonly className?: string } }

export type AppendOnlyViolation = { operation: 'update' | 'delete'; entityName: string }

export type AppendOnlyGuardOptions = {
  isAppendOnly: (entity: unknown) => boolean
  /** Throws the coded error (409 `append_only`); never returns normally. */
  refuse: (violation: AppendOnlyViolation) => Promise<never>
}

export type AppendOnlyGuard = {
  beforeUpdate: (args: GuardEventArgs) => Promise<void>
  beforeDelete: (args: GuardEventArgs) => Promise<void>
}

export function appendOnlyGuard(options: AppendOnlyGuardOptions): AppendOnlyGuard {
  const check = async (args: GuardEventArgs, operation: AppendOnlyViolation['operation']): Promise<void> => {
    if (!options.isAppendOnly(args.entity)) return
    await options.refuse({ operation, entityName: args.meta?.className ?? 'unknown' })
  }
  return {
    beforeUpdate: (args) => check(args, 'update'),
    beforeDelete: (args) => check(args, 'delete'),
  }
}
