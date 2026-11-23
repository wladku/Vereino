// The club's own colour (design tokens R06.2, `docs/ux-concept/tokens.md` *Club accent*; E20-S07 #486): a hex colour from
// the club settings that paints the member header bar, the public hero and the fallback logo. Text on it is black or
// white, whichever contrasts more (WCAG 2.2 relative luminance), which reaches at least 4.58:1 for any colour. Pure.

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

export const BLACK = '#000000'
export const WHITE = '#ffffff'

/** A club colour as the settings store it (`#rrggbb`, lower case) and the text colour that reads on it. */
export type ClubAccent = { color: string; foreground: typeof BLACK | typeof WHITE }

/**
 * The stored form of a typed colour, `#rrggbb` in lower case, or null when `value` is not a hex colour. Accepts three or
 * six hex digits with or without `#` and surrounding spaces (`#1B8F3A`, `1b8f3a`, `#fd0`).
 */
export function normalizeHexColor(value: string): string | null {
  const match = HEX_PATTERN.exec(value.trim())
  if (!match) return null
  // The pattern has exactly one group, which matched.
  const digits = (match[1] as string).toLowerCase()
  const full = digits.length === 3 ? digits.replace(/./g, (digit) => digit + digit) : digits
  return `#${full}`
}

/** The WCAG 2.2 relative luminance of a hex colour (0 black … 1 white); throws on anything else. */
export function relativeLuminance(hex: string): number {
  const color = normalizeHexColor(hex)
  if (!color) throw new Error(`Not a hex colour: ${hex}`)
  const linear = (start: number): number => {
    const channel = Number.parseInt(color.slice(start, start + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(1) + 0.7152 * linear(3) + 0.0722 * linear(5)
}

/** The WCAG contrast ratio of two hex colours, from 1 (same) to 21 (black on white); symmetric. */
export function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first)
  const b = relativeLuminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** Black or white, whichever contrasts more with `background` (black on a tie). */
export function accentForeground(background: string): typeof BLACK | typeof WHITE {
  return contrastRatio(background, WHITE) > contrastRatio(background, BLACK) ? WHITE : BLACK
}

/**
 * The club accent of a stored colour, or null when none is set or the stored value is not a colour (the pages then use
 * the default, `--primary`).
 */
export function clubAccent(stored: string | null | undefined): ClubAccent | null {
  const color = stored ? normalizeHexColor(stored) : null
  return color ? { color, foreground: accentForeground(color) } : null
}
