'use client'
// The client boundary of the club time zone (#231): the server backend layout renders this with the zone it read from
// the club settings, so the `@vereino/ui` barrel enters only the client graph.
import type * as React from 'react'
import { ClubTimeZoneProvider } from '@vereino/ui'

export function ClubTimeZone({ timeZone, children }: { timeZone: string | null; children?: React.ReactNode }) {
  return <ClubTimeZoneProvider timeZone={timeZone}>{children}</ClubTimeZoneProvider>
}
