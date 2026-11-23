// The club's colour on a page (design tokens R06.2, `vereino-tokens.css`; E20-S07 #486): the inline style that sets
// `--club-accent` and `--club-accent-foreground` on a frame's root element, so the header bar, the hero and the
// fallback logo below it (`bg-club-accent text-club-accent-foreground`) take the club's colour. Without a colour the
// style is empty and the tokens keep their default, the theme's primary pair.
import type { ClubAccent } from '@vereino/core'

/** The CSS custom properties of a club colour, or undefined (no style) when the club has none. */
export function clubAccentStyle(accent: ClubAccent | null | undefined): Record<string, string> | undefined {
  if (!accent) return undefined
  return { '--club-accent': accent.color, '--club-accent-foreground': accent.foreground }
}
