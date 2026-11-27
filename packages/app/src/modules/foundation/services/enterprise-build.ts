// The facts of the Enterprise boot check (enterprise package spec DD-E03; #713), read where the server boots
// (`src/instrumentation.ts`): the build switch — inlined by `next build`, so it is the build's decision, not the
// runtime's — whether `@vereino/enterprise` resolves from the app, the ids `src/modules.ts` registers from it, and the
// ids the generator registered. `lib/enterprise-build.ts` decides.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { parseBooleanWithDefault } from '@open-mercato/shared/lib/boolean'
import { ENTERPRISE_PACKAGE, type EnterpriseBuildFacts } from '../lib/enterprise-build'

export async function enterpriseBuildFacts(): Promise<EnterpriseBuildFacts> {
  const [{ enabledModules }, { enabledModuleIds }] = await Promise.all([
    import('@/modules'),
    import('@/.mercato/generated/enabled-module-ids.generated'),
  ])
  return {
    switchOn: parseBooleanWithDefault(process.env.NEXT_PUBLIC_VEREINO_ENTERPRISE, false),
    packageInstalled: existsSync(path.join(process.cwd(), 'node_modules', ENTERPRISE_PACKAGE, 'package.json')),
    switchModuleIds: enabledModules.filter((entry) => entry.from === ENTERPRISE_PACKAGE).map((entry) => entry.id),
    registeredModuleIds: enabledModuleIds,
  }
}
