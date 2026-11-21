// `StatusTag` — the one way Vereino code shows a status (#482, E20-S03): the `--status-*` colours, a Lucide icon and
// the word, as `docs/ux-concept/tokens.md` (R01.2, R01.8) requires. Colour alone never carries the meaning, so a status
// pill without its icon is rejected by lint (`STATUS_PILL_RESTRICTIONS` in `eslint.vereino.mjs`). The icon is
// decorative (`aria-hidden`); the word stays the accessible name.
import * as React from 'react'
import {
  CalendarX,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock,
  Info,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@open-mercato/ui/primitives/badge'
import type { StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'

/** The colour family of a status: the five `--status-*` token groups. */
export type StatusTagTone = StatusBadgeVariant

/**
 * A status: one of the five tones (each with its default icon) or a named kind from the `tokens.md` map whose icon
 * differs from its tone's default.
 */
export type StatusTagStatus =
  | StatusTagTone
  /** `CircleX` on error: "Session canceled", "Rejected". */
  | 'canceled'
  /** `X` on neutral: "Not attending", "Absent". */
  | 'declined'
  /** `CalendarX` on neutral: "Deadline passed", "Closed". */
  | 'closed'
  /** `Users` on info: "Called up", people counts. */
  | 'people'

type StatusTagKind = { tone: StatusTagTone; Icon: LucideIcon }

/** Tone and icon of every status (`tokens.md` → `--status-*` rows). */
export const STATUS_TAG_KINDS: Readonly<Record<StatusTagStatus, StatusTagKind>> = {
  success: { tone: 'success', Icon: CircleCheck },
  warning: { tone: 'warning', Icon: Clock },
  error: { tone: 'error', Icon: CircleAlert },
  canceled: { tone: 'error', Icon: CircleX },
  neutral: { tone: 'neutral', Icon: CircleDashed },
  declined: { tone: 'neutral', Icon: X },
  closed: { tone: 'neutral', Icon: CalendarX },
  info: { tone: 'info', Icon: Info },
  people: { tone: 'info', Icon: Users },
}

// Static class names, so Tailwind's source scan of `@vereino/ui` emits them.
const ICON_TONE_CLASS: Readonly<Record<StatusTagTone, string>> = {
  success: 'text-status-success-icon',
  warning: 'text-status-warning-icon',
  error: 'text-status-error-icon',
  info: 'text-status-info-icon',
  neutral: 'text-status-neutral-icon',
}

export type StatusTagProps = {
  /** The status: a tone or a named kind; it picks the colours and the icon. */
  status: StatusTagStatus
  /** The word (translated by the caller); it is the tag's accessible name. */
  children: React.ReactNode
  /** `stroke` draws the outlined, uncoloured pill (e.g. a skipped delivery); the icon keeps its tone. */
  appearance?: 'light' | 'stroke'
  className?: string
  'data-testid'?: string
}

// Renders what the platform `StatusBadge` renders (same `Badge` variant and appearance classes), plus the icon and the
// `data-*` attributes `StatusBadge` drops.
export function StatusTag({ status, children, appearance, className, 'data-testid': testId }: StatusTagProps) {
  const { tone, Icon } = STATUS_TAG_KINDS[status]
  return (
    <Badge
      variant={tone}
      appearance={appearance === 'light' ? 'lighter' : undefined}
      data-appearance={appearance}
      data-status-tag={status}
      data-testid={testId}
      leadingIcon={<Icon aria-hidden="true" focusable="false" className={ICON_TONE_CLASS[tone]} />}
      className={[
        appearance === 'stroke' ? 'border-border bg-background text-muted-foreground shadow-none' : null,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </Badge>
  )
}
