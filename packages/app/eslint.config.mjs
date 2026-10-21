// Flat ESLint config for a standalone Open Mercato app.
// `next lint` was removed in Next 16, so `yarn lint` runs the ESLint CLI
// against this config instead.
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
// Vereino local patch (engineering standards S3.10): strict rules for Vereino-owned paths only.
import tseslint from 'typescript-eslint'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import boundaries from 'eslint-plugin-boundaries'
import { vereinoModuleBoundaryConfigs, vereinoReactConfigs, vereinoTypeScriptConfigs } from '../../eslint.vereino.mjs'
import { PLATFORM_FILES_IN_VEREINO_PATHS, readVereinoModuleIds } from './scripts/vereino-paths.mjs'

const ignores = [
  'node_modules/**',
  '.next/**',
  '.mercato/**',
  '.ai/framework-context/**',
  'dist/**',
  'out/**',
  'build/**',
  'next-env.d.ts',
]

const ruleOverrides = {
  'react/display-name': 'off',
  'react-hooks/immutability': 'off',
  'react-hooks/preserve-manual-memoization': 'off',
  'react-hooks/purity': 'off',
  'react-hooks/refs': 'off',
  'react-hooks/set-state-in-effect': 'off',
  'react-hooks/static-components': 'off',
}

const vereinoModuleIds = readVereinoModuleIds()
const vereinoTypeScriptFiles = [
  ...vereinoModuleIds.map((id) => `src/modules/${id}/**/*.{ts,tsx}`),
  '.ai/qa/tests/**/*.ts',
]

export default [
  ...nextCoreWebVitals,
  { ignores },
  { name: 'app/rule-overrides', rules: ruleOverrides },
  ...vereinoTypeScriptConfigs({
    tseslint,
    files: vereinoTypeScriptFiles,
    ignores: PLATFORM_FILES_IN_VEREINO_PATHS,
    tsconfigRootDir: import.meta.dirname,
  }),
  ...(vereinoModuleIds.length > 0
    ? [{ ...jsxA11y.flatConfigs.recommended, files: vereinoModuleIds.map((id) => `src/modules/${id}/**/*.tsx`) }]
    : []),
  ...vereinoModuleBoundaryConfigs({ boundaries, moduleIds: vereinoModuleIds }),
  ...vereinoReactConfigs({ moduleIds: vereinoModuleIds }),
]
