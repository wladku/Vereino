import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

// The demo Enterprise module (enterprise package spec DD-E11, J-E01, J-E02): it exists to prove, in public CI, that a
// module of `@vereino/enterprise` is registered only in the overlay build and answers per tenant by licence state.
export const metadata: ModuleInfo = {
  name: 'enterprise_demo',
  title: 'Vereino Enterprise demo',
  version: '0.1.0',
  description: 'Shows the licence state of the Enterprise demo feature for the current club. Test fixture only.',
  author: 'Vereino',
  license: 'AGPL-3.0-only',
}

/** The licensable feature id of this module: the same as the module id (spec *Domain Vocabulary*). */
export const ENTERPRISE_DEMO_FEATURE = 'enterprise_demo'
