// The matrix and SVG path of a QR code (personal invitation link spec IL-D06, Q-IL01; #868, reused by #869): the
// `qrcode` package (MIT, approved by the owner on 2026-11-26) encodes the text in the browser — no third-party service,
// the link never leaves the device — and this file turns its module matrix into one SVG path with a quiet zone.
import QRCode from 'qrcode'

/** The quiet zone around the code in modules: 4 is the minimum ISO/IEC 18004 asks for. */
export const QR_QUIET_ZONE = 4

export type QrMatrix = {
  /** Modules per side, without the quiet zone. */
  size: number
  isDark: (row: number, col: number) => boolean
}

/** The module matrix of `text` with error correction level M (15 %: survives a cracked phone screen). */
export function qrMatrix(text: string): QrMatrix {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' })
  return { size: modules.size, isDark: (row, col) => Boolean(modules.get(row, col)) }
}

/** One path of unit squares for the dark modules, offset by the quiet zone; the view box is `size + 2 × zone`. */
export function qrSvgPath(matrix: QrMatrix, quietZone: number = QR_QUIET_ZONE): string {
  const parts: string[] = []
  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      if (matrix.isDark(row, col)) parts.push(`M${String(col + quietZone)} ${String(row + quietZone)}h1v1h-1z`)
    }
  }
  return parts.join('')
}
