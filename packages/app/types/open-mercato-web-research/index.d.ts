// `@open-mercato/web-research` came in only as a dependency of `@open-mercato/enterprise`, which Vereino removed
// (ENG-Q-10, #466). The platform generator still writes `.mercato/generated/web-research-adapters.generated.ts`
// with `import type { AdapterRegistryEntry } from '@open-mercato/web-research'` and, with no adapter package
// installed, an empty `webResearchAdapterEntries` list. This declaration gives that type-only import its shape
// (the one the generator builds: `{ packageName, module }`) so the app typechecks without the package.
declare module '@open-mercato/web-research' {
  export type AdapterRegistryEntry = {
    packageName: string
    module: unknown
  }
}
