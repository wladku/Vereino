'use client'
// The client boundary of the platform accessibility repairs (E20-S18, #497): the server backend layout renders this, so
// the `@vereino/ui` barrel enters only the client graph (as `ClubTimeZone`).
import { PlatformA11yRepairs as Repairs } from '@vereino/ui'

export function PlatformA11yRepairs() {
  return <Repairs />
}
