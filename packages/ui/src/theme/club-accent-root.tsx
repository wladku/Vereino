// The root element of a frame that carries the club's colour (E20-S07 #486): a `div` with the frame's classes and the
// `--club-accent` / `--club-accent-foreground` variables of `clubAccentStyle`, so app pages set the colour through this
// shared component instead of an inline style (design-system check `inline-style`).
import * as React from 'react'
import type { ClubAccent } from '@vereino/core'
import { clubAccentStyle } from '#src/theme/club-accent-style'

export function ClubAccentRoot({
  accent,
  className,
  children,
}: {
  accent: ClubAccent | null | undefined
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className} style={clubAccentStyle(accent)}>
      {children}
    </div>
  )
}
