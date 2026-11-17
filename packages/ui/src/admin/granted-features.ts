// Which features the signed-in user holds, for hiding actions the server would refuse anyway (people life-cycle spec
// REQ-L14: the empty-picker hint offers a create path only with the creating feature). Wildcard-aware like the
// platform's own check. Authorization stays on the routes and commands. `use-granted-features.tsx` is the hook.
import { requestEffect, type EffectCallback, type Timers } from '#src/admin/request-effect'
import type { MemberFeatureCheck } from '#src/member/member-nav-features'

/** Whether `granted` (the platform feature-check answer) covers `feature`: exact, `*`, or a `module.*` wildcard. */
export function grantsFeature(granted: readonly string[], feature: string): boolean {
  return granted.some(
    (entry) => entry === '*' || entry === feature || (entry.endsWith('.*') && feature.startsWith(entry.slice(0, -1))),
  )
}

export type FeatureGrants<F extends string> = { readonly [K in F]: boolean } & { readonly loaded: boolean }

/** One flag per asked feature; all false (and `loaded` false) until the check has answered. */
export function featureGrants<F extends string>(
  features: readonly F[],
  granted: readonly string[] | null,
): FeatureGrants<F> {
  const flags = Object.fromEntries(features.map((feature) => [feature, grantsFeature(granted ?? [], feature)]))
  return { ...flags, loaded: granted !== null } as FeatureGrants<F>
}

/** The effect that runs the check (`featureCheckOver`) once per feature list; a refused or failed check grants nothing. */
export function featureCheckEffect(input: {
  features: readonly string[]
  check: MemberFeatureCheck
  onGranted: (granted: readonly string[]) => void
  timers?: Timers
}): EffectCallback {
  return requestEffect({
    delayMs: 0,
    request: () => input.check(input.features),
    onSuccess: (granted) => {
      input.onGranted(granted ?? [])
    },
    onFailure: () => {
      input.onGranted([])
    },
    timers: input.timers,
  })
}

/** The effect's dependencies: the feature list by value, and the check. */
export function featureCheckDeps(features: readonly string[], check: MemberFeatureCheck): readonly unknown[] {
  return [features.join('\n'), check]
}
