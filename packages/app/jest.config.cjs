/** @type {import('jest').Config} */
// Unit-test config for a standalone Open Mercato app.
// Integration tests run through Playwright (`yarn test:integration:ephemeral`)
// and are excluded here.
// `create-mercato-app` skips `__tests__`/`__integration__` while copying the
// template, so a freshly scaffolded app owns no test files until you write one.

// Vereino local patch (engineering standards S13.6): 100 % line, branch, function and statement
// coverage for the pure domain code in lib/ of every Vereino module listed in vereino-modules.json.
const fs = require('node:fs')
const path = require('node:path')
const vereinoLibDirs = require('./vereino-modules.json')
  .modules.map((id) => `src/modules/${id}/lib`)
  .filter((dir) => fs.existsSync(path.join(__dirname, dir)))
const vereinoCoverage =
  vereinoLibDirs.length > 0
    ? {
        collectCoverage: true,
        collectCoverageFrom: vereinoLibDirs.map((dir) => `<rootDir>/${dir}/**/*.{ts,tsx}`),
        coverageThreshold: Object.fromEntries(
          vereinoLibDirs.map((dir) => [`./${dir}/`, { lines: 100, branches: 100, functions: 100, statements: 100 }]),
        ),
      }
    : {}

module.exports = {
  ...vereinoCoverage,
  testEnvironment: 'node',
  testTimeout: 30000,
  passWithNoTests: true,
  rootDir: '.',
  roots: ['<rootDir>/src'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    '^@/\\.mercato/(.*)$': '<rootDir>/.mercato/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^#generated/(.*)$': '<rootDir>/.mercato/generated/$1',
  },
  // `@open-mercato/shared/lib/commands` pulls in ESM-only MikroORM, whose
  // `import.meta.resolve` cannot be parsed as CommonJS. The local transformer
  // strips those usages before delegating to ts-jest; without it every command,
  // entity, or data-engine test fails to load.
  transform: {
    '^.+\\.(t|j)sx?$': [
      '<rootDir>/scripts/jest-mikroorm-transformer.cjs',
      {
        tsconfig: {
          jsx: 'react-jsx',
          module: 'commonjs',
          moduleResolution: 'node',
          esModuleInterop: true,
          allowJs: true,
          isolatedModules: true,
        },
        diagnostics: false,
      },
    ],
  },
  transformIgnorePatterns: ['/node_modules/(?!(@open-mercato|@mikro-orm|@tanstack/react-table|@tanstack/table-core|@tanstack/react-store|@tanstack/store)/)'],
  testPathIgnorePatterns: ['/node_modules/', '/.next/', '/.mercato/', '/.ai/qa/'],
}
