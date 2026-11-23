// Pre-deploy ACL-sync wrapper (DD-M11, TEST-M10 unit part; #673): the fingerprint changes exactly when a role default
// or the platform version changes, and the decision skips the sync only on an exact match.
import { describe, expect, it } from '@jest/globals'
import {
  decideRoleAclSync,
  mergeRoleFeatures,
  parseSyncRoleAclsArgs,
  roleAclDefaultsHash,
  storedRoleAclHash,
  type RoleFeatureModule,
} from '../role-acl-defaults'

const MODULES: RoleFeatureModule[] = [
  { id: 'people', setup: { defaultRoleFeatures: { admin: ['people.*'], vereino_member: ['people.self.view'] } } },
  {
    id: 'payments',
    setup: { defaultRoleFeatures: { admin: ['payments.*', 'people.*'], vereino_payer: ['payments.pay'] } },
  },
  { id: 'example' },
]

describe('mergeRoleFeatures', () => {
  it('merges every module per role, sorted and unique, and ignores non-arrays and non-strings', () => {
    const modules: RoleFeatureModule[] = [
      ...MODULES,
      { id: 'odd', setup: { defaultRoleFeatures: { employee: 'x', vereino_member: ['b.view', 7, 'a.view'] } } },
    ]
    expect(mergeRoleFeatures(modules, (entry) => entry.setup?.defaultRoleFeatures)).toEqual({
      admin: ['payments.*', 'people.*'],
      vereino_member: ['a.view', 'b.view', 'people.self.view'],
      vereino_payer: ['payments.pay'],
    })
  })
})

describe('roleAclDefaultsHash', () => {
  const base = roleAclDefaultsHash(MODULES, '0.9.0')

  it('is a stable SHA-256 independent of module and feature order', () => {
    expect(base).toMatch(/^[0-9a-f]{64}$/)
    const reordered: RoleFeatureModule[] = [
      {
        id: 'payments',
        setup: { defaultRoleFeatures: { vereino_payer: ['payments.pay'], admin: ['people.*', 'payments.*'] } },
      },
      { id: 'people', setup: { defaultRoleFeatures: { vereino_member: ['people.self.view'], admin: ['people.*'] } } },
    ]
    expect(roleAclDefaultsHash(reordered, '0.9.0')).toBe(base)
  })

  it('changes with a feature, a role, the platform version or a portal role default', () => {
    const added: RoleFeatureModule[] = [
      ...MODULES,
      { id: 'groups', setup: { defaultRoleFeatures: { admin: ['groups.*'] } } },
    ]
    expect(roleAclDefaultsHash(added, '0.9.0')).not.toBe(base)
    expect(roleAclDefaultsHash(MODULES, '0.9.1')).not.toBe(base)
    const portal: RoleFeatureModule[] = [
      ...MODULES,
      { id: 'customer_accounts', setup: { defaultCustomerRoleFeatures: { buyer: ['portal.view'] } } },
    ]
    expect(roleAclDefaultsHash(portal, '0.9.0')).not.toBe(base)
  })
})

describe('decideRoleAclSync', () => {
  it('syncs when forced, on the first run or after a change, and skips only on a match', () => {
    expect(decideRoleAclSync({ storedHash: 'a', currentHash: 'a', force: true })).toEqual({
      sync: true,
      reason: 'forced',
    })
    expect(decideRoleAclSync({ storedHash: null, currentHash: 'a', force: false })).toEqual({
      sync: true,
      reason: 'first-run',
    })
    expect(decideRoleAclSync({ storedHash: 'b', currentHash: 'a', force: false })).toEqual({
      sync: true,
      reason: 'changed',
    })
    expect(decideRoleAclSync({ storedHash: 'a', currentHash: 'a', force: false })).toEqual({
      sync: false,
      reason: 'unchanged',
    })
  })
})

describe('storedRoleAclHash', () => {
  it('reads the hash of the stored object and nothing else', () => {
    expect(storedRoleAclHash({ hash: 'abc', syncedAt: 'x' })).toBe('abc')
    expect(storedRoleAclHash(null)).toBeNull()
    expect(storedRoleAclHash('abc')).toBeNull()
    expect(storedRoleAclHash({ hash: '' })).toBeNull()
    expect(storedRoleAclHash({ hash: 1 })).toBeNull()
  })
})

describe('parseSyncRoleAclsArgs', () => {
  it('accepts no option or --force and refuses anything else', () => {
    expect(parseSyncRoleAclsArgs([])).toEqual({ force: false })
    expect(parseSyncRoleAclsArgs(['--force'])).toEqual({ force: true })
    expect(parseSyncRoleAclsArgs(['--tenant', 'x'])).toEqual({ error: 'unknown argument --tenant' })
  })
})
