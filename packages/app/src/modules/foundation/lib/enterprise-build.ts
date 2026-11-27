// The boot check of an Enterprise overlay build (enterprise package spec DD-E03, *Domain Vocabulary* "Overlay build";
// #713). The build decides once whether Enterprise modules are registered: `NEXT_PUBLIC_VEREINO_ENTERPRISE` is inlined
// into the server bundle by `next build`, and `yarn generate` writes the registered module ids. At boot the server
// compares that decision with the package it can resolve and the ids the generator registered, and refuses to start on
// a mismatch — a runtime that differs from the build, or a platform parser that silently ignored the switch.

/** The private package and the build switch (`BACKWARD_COMPATIBILITY.md`: protected). */
export const ENTERPRISE_PACKAGE = '@vereino/enterprise'
export const ENTERPRISE_SWITCH = 'NEXT_PUBLIC_VEREINO_ENTERPRISE'

export type EnterpriseBuildFacts = {
  /** The switch as this build saw it. */
  switchOn: boolean
  /** Whether `@vereino/enterprise` resolves from the app. */
  packageInstalled: boolean
  /** The ids `src/modules.ts` registers under the switch, each with the Enterprise package as its source. */
  switchModuleIds: readonly string[]
  /** The module ids the generator registered (`enabled-module-ids.generated.ts`). */
  registeredModuleIds: readonly string[]
}

/** The reason to refuse to start, or null when the build, the package and the registry agree. */
export function enterpriseBuildProblem(facts: EnterpriseBuildFacts): string | null {
  if (facts.switchOn && !facts.packageInstalled) {
    return `${ENTERPRISE_SWITCH} is set but ${ENTERPRISE_PACKAGE} is not installed`
  }
  if (!facts.switchOn && facts.packageInstalled) {
    return `${ENTERPRISE_PACKAGE} is installed but ${ENTERPRISE_SWITCH} was not set for this build: its modules are not registered`
  }
  if (!facts.switchOn) return null
  if (facts.switchModuleIds.length === 0) {
    return `${ENTERPRISE_SWITCH} is set but src/modules.ts registers no module from ${ENTERPRISE_PACKAGE}`
  }
  const registered = new Set(facts.registeredModuleIds)
  const missing = facts.switchModuleIds.filter((id) => !registered.has(id))
  if (missing.length > 0) {
    return `${ENTERPRISE_SWITCH} is set but the generated module registry lacks ${missing.join(', ')}: run yarn generate with the switch`
  }
  return null
}
