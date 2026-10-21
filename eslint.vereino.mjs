// Shared lint rules for Vereino-owned code (engineering standards S3.10, S4.3, S4.9, ADR-018).
// Plugins are installed per workspace, so every workspace's eslint.config.mjs passes its own plugin
// instances in; this file imports nothing.

export const VEREINO_TYPESCRIPT_RULES = {
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-misused-promises': 'error',
  '@typescript-eslint/consistent-type-imports': 'error',
  '@typescript-eslint/switch-exhaustiveness-check': 'error',
  '@typescript-eslint/no-unnecessary-condition': 'warn',
}

// React rules the scaffold switches off for platform code; Vereino code keeps them on.
export const VEREINO_REACT_RULES = {
  'react/display-name': 'error',
  'react-hooks/immutability': 'error',
  'react-hooks/preserve-manual-memoization': 'error',
  'react-hooks/purity': 'error',
  'react-hooks/refs': 'error',
  'react-hooks/set-state-in-effect': 'error',
  'react-hooks/static-components': 'error',
}

// Pure domain code (module lib/ folders and @vereino/core) stays framework-free (S4.9, ADR-001).
export const FRAMEWORK_FREE_IMPORT_RESTRICTIONS = {
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        {
          group: ['@open-mercato/*', '@mikro-orm/*', 'react', 'react/*', 'react-dom', 'react-dom/*', 'next', 'next/*'],
          message:
            'Pure domain code must not depend on the platform, the ORM, React or Next.js (engineering standards S4.9).',
        },
        {
          group: [
            'node:fs',
            'node:fs/*',
            'node:child_process',
            'node:net',
            'node:http',
            'node:https',
            'fs',
            'child_process',
          ],
          message: 'Pure domain code performs no I/O (engineering standards S4.9).',
        },
        {
          group: [
            '../data/*',
            '../commands/*',
            '../api/*',
            '../subscribers/*',
            '../workers/*',
            '../backend/*',
            '../frontend/*',
          ],
          message: 'lib/ must not import data, commands, routes, workers or pages (engineering standards S4.2).',
        },
      ],
    },
  ],
}

const MODULE_ALIAS_RESTRICTION = {
  group: ['@/modules/*'],
  message:
    'Inside a Vereino module import its own files relatively; another module is reached through DI, events or `import type` (engineering standards S4.3).',
}

// Strict, type-aware rules for TypeScript files of a workspace.
export function vereinoTypeScriptConfigs({ tseslint, files, ignores = [], tsconfigRootDir }) {
  if (files.length === 0) return []
  return [
    ...tseslint.configs.strictTypeChecked.map((config) => ({ ...config, files, ignores })),
    {
      files,
      ignores,
      languageOptions: { parserOptions: { projectService: true, tsconfigRootDir } },
      rules: VEREINO_TYPESCRIPT_RULES,
    },
  ]
}

// Module boundaries inside packages/app (S4.3): a Vereino module may import another Vereino module
// only with `import type`; runtime coupling goes through DI tokens, events and ids.
export function vereinoModuleBoundaryConfigs({ boundaries, moduleIds }) {
  if (moduleIds.length === 0) return []
  const files = moduleIds.map((id) => `src/modules/${id}/**/*.{ts,tsx}`)
  return [
    {
      files,
      plugins: { boundaries },
      settings: {
        'boundaries/elements': [{ type: 'vereino-module', pattern: 'src/modules/*', capture: ['moduleId'] }],
        'import/resolver': { node: { extensions: ['.ts', '.tsx', '.js', '.mjs', '.json'] } },
      },
      rules: {
        'boundaries/dependencies': [
          2,
          {
            default: 'allow',
            policies: moduleIds.map((id) => ({
              from: { element: { type: 'vereino-module', captured: { moduleId: id } } },
              disallow: {
                to: { element: { type: 'vereino-module', captured: { moduleId: `!${id}` } } },
                dependency: { kind: 'value' },
              },
            })),
          },
        ],
        'no-restricted-imports': ['error', { patterns: [MODULE_ALIAS_RESTRICTION] }],
      },
    },
    {
      files: moduleIds.map((id) => `src/modules/${id}/lib/**/*.{ts,tsx}`),
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              MODULE_ALIAS_RESTRICTION,
              ...FRAMEWORK_FREE_IMPORT_RESTRICTIONS['no-restricted-imports'][1].patterns,
            ],
          },
        ],
      },
    },
    {
      files: moduleIds.map((id) => `src/modules/${id}/**/*.{ts,tsx}`),
      ignores: moduleIds.map((id) => `src/modules/${id}/**/__tests__/**`),
      rules: { 'no-console': 'error' },
    },
  ]
}

// React rules for Vereino module code; needs the React plugins that eslint-config-next registers.
export function vereinoReactConfigs({ moduleIds }) {
  if (moduleIds.length === 0) return []
  return [{ files: moduleIds.map((id) => `src/modules/${id}/**/*.{ts,tsx}`), rules: VEREINO_REACT_RULES }]
}
