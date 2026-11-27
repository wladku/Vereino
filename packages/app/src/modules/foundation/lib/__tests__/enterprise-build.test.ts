// The boot check of the Enterprise overlay build (enterprise package spec DD-E03; #713): the server refuses to start
// when the build switch, the installed package and the generated module registry disagree.
import { describe, expect, it } from '@jest/globals'
import { enterpriseBuildProblem, type EnterpriseBuildFacts } from '../enterprise-build'

const PUBLIC: EnterpriseBuildFacts = {
  switchOn: false,
  packageInstalled: false,
  switchModuleIds: [],
  registeredModuleIds: ['auth', 'foundation'],
}
const OVERLAY: EnterpriseBuildFacts = {
  switchOn: true,
  packageInstalled: true,
  switchModuleIds: ['enterprise_demo'],
  registeredModuleIds: ['auth', 'foundation', 'enterprise_demo'],
}

describe('enterpriseBuildProblem', () => {
  it('accepts the public build and the overlay build', () => {
    expect(enterpriseBuildProblem(PUBLIC)).toBeNull()
    expect(enterpriseBuildProblem(OVERLAY)).toBeNull()
  })

  it('refuses a switch without the package', () => {
    expect(enterpriseBuildProblem({ ...OVERLAY, packageInstalled: false })).toBe(
      'NEXT_PUBLIC_VEREINO_ENTERPRISE is set but @vereino/enterprise is not installed',
    )
  })

  it('refuses the package without the switch', () => {
    expect(enterpriseBuildProblem({ ...PUBLIC, packageInstalled: true })).toContain(
      '@vereino/enterprise is installed but NEXT_PUBLIC_VEREINO_ENTERPRISE was not set',
    )
  })

  it('refuses a switch under which modules.ts registers nothing', () => {
    expect(enterpriseBuildProblem({ ...OVERLAY, switchModuleIds: [] })).toContain('registers no module')
  })

  it('names the Enterprise modules the generator did not register', () => {
    expect(enterpriseBuildProblem({ ...OVERLAY, registeredModuleIds: ['auth'] })).toBe(
      'NEXT_PUBLIC_VEREINO_ENTERPRISE is set but the generated module registry lacks enterprise_demo: run yarn generate with the switch',
    )
  })
})
