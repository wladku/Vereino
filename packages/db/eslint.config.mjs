// @vereino/db: MikroORM and PostgreSQL tooling (engineering standards S3.10, S4.10; AGENTS.md package table).
import tseslint from 'typescript-eslint'
import { vereinoTypeScriptConfigs } from '../../eslint.vereino.mjs'

const files = ['src/**/*.{ts,tsx}']

export default [
  { ignores: ['node_modules/**'] },
  ...vereinoTypeScriptConfigs({ tseslint, files, tsconfigRootDir: import.meta.dirname }),
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
              group: [
                '@vereino/app',
                '@vereino/app/*',
                '@vereino/ui',
                '@vereino/ui/*',
                'react',
                'react/*',
                'next',
                'next/*',
              ],
              message: '@vereino/db may import only @vereino/core and MikroORM (AGENTS.md → Stack and Monorepo).',
            },
          ],
        },
      ],
    },
  },
]
