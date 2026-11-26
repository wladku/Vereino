// #808 — `yarn dev` never falls back to webpack when Linux inotify limits are too low.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ensureDevInotifyLimits,
  formatInotifyLimitFailure,
  resolveDevBundlerDecision,
  resolveRequestedDevBundler,
} from '../dev-inotify-limits.mjs'

const LOW_LIMITS = {
  max_user_watches: '8192',
  max_user_instances: '128',
  max_queued_events: '16384',
}

function readLowLimits(filePath) {
  const name = String(filePath).split('/').pop()
  if (name in LOW_LIMITS) return LOW_LIMITS[name]
  return 'Linux version 6.0.0-generic'
}

test('low inotify limits that cannot be raised stop yarn dev instead of switching to webpack', () => {
  const result = ensureDevInotifyLimits({
    env: {},
    platform: 'linux',
    readFileSync: readLowLimits,
    spawnSync: () => ({ status: 1, stderr: 'sudo: a password is required' }),
    getuid: () => 1000,
  })
  assert.equal(result.ok, false)

  for (const requestedBundler of ['auto', 'turbopack']) {
    const decision = resolveDevBundlerDecision({ requestedBundler, inotifyResult: result })
    assert.deepEqual(decision, { bundler: 'turbopack', fallback: false, shouldCheckInotify: true })
  }
  assert.match(result.message, /yarn dev:fix-wsl-watchers/)
})

test('the default bundler is turbopack and checks the inotify limits', () => {
  assert.equal(resolveRequestedDevBundler({}), 'auto')
  assert.deepEqual(resolveDevBundlerDecision({ requestedBundler: 'auto' }), {
    bundler: 'turbopack',
    fallback: false,
    shouldCheckInotify: true,
  })
  assert.deepEqual(resolveDevBundlerDecision({ requestedBundler: 'unknown' }), {
    bundler: 'turbopack',
    fallback: false,
    shouldCheckInotify: true,
  })
})

test('webpack stays an explicit opt-in that skips the inotify check', () => {
  assert.equal(resolveRequestedDevBundler({ OM_DEV_BUNDLER: ' Webpack ' }), 'webpack')
  assert.deepEqual(resolveDevBundlerDecision({ requestedBundler: 'webpack' }), {
    bundler: 'webpack',
    fallback: false,
    shouldCheckInotify: false,
  })
})

test('the failure message names the fix command and the manual sysctl lines', () => {
  const message = formatInotifyLimitFailure({
    current: { max_user_watches: 8192 },
    issues: [{ name: 'max_user_watches', current: 8192, required: 4194304 }],
    manualCommands: ['sudo sysctl -w fs.inotify.max_user_watches=4194304'],
    isWsl: true,
  })
  assert.match(message, /WSL2\/Linux file-watch limits are too low/)
  assert.match(message, /Run `yarn dev:fix-wsl-watchers` once/)
  assert.match(message, /sudo sysctl -w fs\.inotify\.max_user_watches=4194304/)
  assert.match(message, /Then start `yarn dev` again\./)
})
