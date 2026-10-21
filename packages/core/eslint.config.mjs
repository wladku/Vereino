// @vereino/core: framework-free domain logic (engineering standards S3.10, S4.9, S4.10).
import tseslint from 'typescript-eslint'
import { FRAMEWORK_FREE_IMPORT_RESTRICTIONS, vereinoTypeScriptConfigs } from '../../eslint.vereino.mjs'

const files = ['src/**/*.{ts,tsx}']

export default [
  { ignores: ['node_modules/**'] },
  ...vereinoTypeScriptConfigs({ tseslint, files, tsconfigRootDir: import.meta.dirname }),
  {
    files,
    ignores: ['src/**/__tests__/**'],
    rules: { 'no-console': 'error', ...FRAMEWORK_FREE_IMPORT_RESTRICTIONS },
  },
]
