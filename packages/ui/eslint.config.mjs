// @vereino/ui: shared React components (engineering standards S3.10, S4.10, S7; AGENTS.md package table).
import tseslint from 'typescript-eslint'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import { vereinoTypeScriptConfigs } from '../../eslint.vereino.mjs'

const files = ['src/**/*.{ts,tsx}']

export default [
  { ignores: ['node_modules/**'] },
  ...vereinoTypeScriptConfigs({ tseslint, files, tsconfigRootDir: import.meta.dirname }),
  { ...jsxA11y.flatConfigs.recommended, files: ['src/**/*.tsx'] },
  {
    files,
    ignores: ['src/**/__tests__/**'],
    rules: {
      'no-console': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@vereino/app', '@vereino/app/*', '@vereino/db', '@vereino/db/*', '@mikro-orm/*'],
              message:
                '@vereino/ui may import only @vereino/core, React and @open-mercato/ui (AGENTS.md → Stack and Monorepo).',
            },
          ],
        },
      ],
    },
  },
]
