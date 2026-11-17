// `useGrantedFeatures` (people life-cycle spec REQ-L14): the shared hook behind every "may this user create it?"
// question of the admin forms; it replaces the module-local copies that each posted to the platform feature check.
// The app passes its API client (the platform `apiCall`), as the member frames do, so this package stays free of the
// platform's client sources.
import * as React from 'react'
import { featureCheckDeps, featureCheckEffect, featureGrants } from '#src/admin/granted-features'
import type { FeatureGrants } from '#src/admin/granted-features'
import { featureCheckOver } from '#src/member/member-nav-features'
import type { MemberApiCall } from '#src/member/member-nav-features'

/** One flag per feature (wildcard-aware) and `loaded`; every flag is false until the check answers. */
export function useGrantedFeatures<F extends string>(features: readonly F[], call: MemberApiCall): FeatureGrants<F> {
  const [granted, setGranted] = React.useState<readonly string[] | null>(null)
  const check = React.useMemo(() => featureCheckOver(call), [call])
  // The list is compared by value (`featureCheckDeps`), so a fresh array literal per render runs no second check.
  React.useEffect(featureCheckEffect({ features, check, onGranted: setGranted }), featureCheckDeps(features, check))
  return featureGrants(features, granted)
}
