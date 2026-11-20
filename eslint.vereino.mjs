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

// `@/modules/foundation` (the foundation module's `index.ts`) is the one allowed alias import: business modules use
// its public helpers (foundation spec REQ-F16); its internals stay private.
const MODULE_ALIAS_RESTRICTION = {
  group: ['@/modules/*', '!@/modules/foundation', '@/modules/foundation/*'],
  message:
    'Inside a Vereino module import its own files relatively; another module is reached through DI, events, `import type` or the foundation helpers from `@/modules/foundation` (engineering standards S4.3, foundation spec REQ-F16).',
}

// The ORM stays in the persistence layers (foundation spec REQ-F16): a route, subscriber, worker or page cannot query it.
const ORM_IMPORT_RESTRICTION = {
  group: ['@mikro-orm/*'],
  message:
    '`@mikro-orm/*` may be imported only in data/**, commands/**, services/**, setup.ts, di.ts and migrations (foundation spec REQ-F16).',
}

// Dialogs and sheets return focus to their opener on close (E20-S02, #481, WCAG 2.4.3): Vereino code takes their
// content from `src/components/ui/dialog.tsx`, which wraps the platform one; the other parts still come from the platform.
export const DIALOG_CONTENT_RESTRICTIONS = [
  {
    name: '@open-mercato/ui/primitives/dialog',
    importNames: ['DialogContent'],
    message:
      'Import `DialogContent` from `@/components/ui/dialog`: it returns focus to the element that opened the dialog (#481).',
  },
  {
    name: '@open-mercato/ui/primitives/sheet',
    importNames: ['SheetContent'],
    message:
      'Import `SheetContent` from `@/components/ui/dialog`: it returns focus to the element that opened the sheet (#481).',
  },
]

/** The foundation module's public entry, the only file of another Vereino module a module may import by value. */
export const FOUNDATION_PUBLIC_ENTRY = 'src/modules/foundation/index.ts'

/** Module paths (relative to `src/modules/<id>/`) where `@mikro-orm/*` imports are allowed. */
export const ORM_ALLOWED_MODULE_PATHS = ['data/**', 'commands/**', 'services/**', 'migrations/**', 'setup.ts', 'di.ts']

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
        // The foundation's `index.ts` is its public entry (foundation spec REQ-F16): matched first as its own element
        // type, so a value import of it is allowed while the foundation's other files stay a `vereino-module`.
        'boundaries/elements': [
          { type: 'foundation-public', pattern: FOUNDATION_PUBLIC_ENTRY, mode: 'full' },
          { type: 'vereino-module', pattern: 'src/modules/*', capture: ['moduleId'] },
        ],
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
        'no-restricted-imports': [
          'error',
          { paths: DIALOG_CONTENT_RESTRICTIONS, patterns: [MODULE_ALIAS_RESTRICTION, ORM_IMPORT_RESTRICTION] },
        ],
      },
    },
    {
      files: moduleIds.flatMap((id) =>
        ORM_ALLOWED_MODULE_PATHS.map((allowed) =>
          allowed.endsWith('/**') ? `src/modules/${id}/${allowed}/*.{ts,tsx}` : `src/modules/${id}/${allowed}`,
        ),
      ),
      rules: {
        'no-restricted-imports': [
          'error',
          { paths: DIALOG_CONTENT_RESTRICTIONS, patterns: [MODULE_ALIAS_RESTRICTION] },
        ],
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

// Every status shows its word and its icon (docs/ux-concept/tokens.md R01.2, R01.8; #482): Vereino code renders a status
// pill only through `StatusTag` from `@vereino/ui`. A bare platform `StatusBadge`, or a `Tag`/`Badge` given a status
// tone as a literal, is a status without its icon. Category tags (a `Tag` whose variant comes from a kind map, a filter
// chip) are labels, not statuses, and stay allowed.
const STATUS_TONE_LITERAL = '/^(success|warning|error|info|neutral)$/'
const STATUS_PILL_MESSAGE =
  'A status shows its word and its icon: use `StatusTag` from `@vereino/ui` (docs/ux-concept/tokens.md R01.2, R01.8).'
export const STATUS_PILL_RESTRICTIONS = {
  'no-restricted-syntax': [
    'error',
    {
      selector:
        "ImportDeclaration[source.value='@open-mercato/ui/primitives/status-badge'] > ImportSpecifier[imported.name='StatusBadge']",
      message: STATUS_PILL_MESSAGE,
    },
    {
      selector: `JSXOpeningElement[name.name=/^(Tag|Badge)$/] > JSXAttribute[name.name='variant'][value.value=${STATUS_TONE_LITERAL}]`,
      message: STATUS_PILL_MESSAGE,
    },
  ],
}

// The status-pill rule for the given Vereino UI files.
export function vereinoStatusPillConfigs({ files, ignores = [] }) {
  if (files.length === 0) return []
  return [{ name: 'vereino/status-pill', files, ignores, rules: STATUS_PILL_RESTRICTIONS }]
}
