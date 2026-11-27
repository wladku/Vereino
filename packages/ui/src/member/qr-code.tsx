// `QrCode` (personal invitation link spec IL-D06; #868, #869): a QR code drawn as an SVG from a text — the guardian's
// invitation link, later a group's join page. Dark modules on white with a four-module quiet zone in both themes, so
// a phone camera reads it from a dark-mode screen too; the colours are those of the code, not of the theme. The image
// is named for assistive technology by `label`; the text it encodes is shown by the caller next to it.
import * as React from 'react'
import { QR_QUIET_ZONE, qrMatrix, qrSvgPath } from '#src/member/qr-code-model'

export type QrCodeProps = {
  /** The text to encode, usually an absolute URL. */
  value: string
  /** The accessible name of the image, e.g. "QR code of the invitation link". */
  label: string
  /** Edge length in CSS pixels; at least 240 for reading at arm's length (spec *UI architecture*). */
  size?: number
  className?: string
  'data-testid'?: string
}

export function QrCode({ value, label, size = 240, className, 'data-testid': testId }: QrCodeProps) {
  const matrix = React.useMemo(() => qrMatrix(value), [value])
  const view = matrix.size + 2 * QR_QUIET_ZONE
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${String(view)} ${String(view)}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={['max-w-full rounded-md', className].filter(Boolean).join(' ')}
      data-testid={testId}
    >
      <rect width={view} height={view} fill="#ffffff" />
      <path d={qrSvgPath(matrix)} fill="#000000" />
    </svg>
  )
}
