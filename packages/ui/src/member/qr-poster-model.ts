// A printable QR poster (group sign-up QR code, #869; personal invitation link spec IL-D06): one A4 page as a
// standalone SVG document — a title, a few lines of text, the QR code of `value` and the address itself under it, so
// a parent without a camera app can type it. Drawn in the browser from the same `qrcode` matrix as `QrCode`; nothing
// leaves the device. Dark on white in every theme, because it is printed.
import { QR_QUIET_ZONE, qrMatrix, qrSvgPath } from '#src/member/qr-code-model'

export type QrPosterContent = {
  /** The text the code encodes, usually an absolute URL; also printed under the code. */
  value: string
  /** The headline, e.g. the group's name. */
  title: string
  /** Lines under the headline, e.g. the club and the section, then "Scan the code to sign up". */
  lines?: readonly string[]
}

/** The page: A4 portrait in millimetres. */
export const QR_POSTER_WIDTH = 210
export const QR_POSTER_HEIGHT = 297
/** The edge of the code with its quiet zone, in millimetres. */
const CODE_SIZE = 150

/** `text` safe inside an SVG text node or attribute. */
export function escapeSvgText(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function textLine(text: string, y: number, size: number, weight: 'bold' | 'normal'): string {
  return (
    `<text x="${String(QR_POSTER_WIDTH / 2)}" y="${String(y)}" font-size="${String(size)}" font-weight="${weight}" ` +
    `text-anchor="middle">${escapeSvgText(text)}</text>`
  )
}

/** The poster as a standalone SVG document (with the XML declaration), ready for a `.svg` download or print. */
export function qrPosterSvg(content: QrPosterContent): string {
  const matrix = qrMatrix(content.value)
  const view = matrix.size + 2 * QR_QUIET_ZONE
  const lines = (content.lines ?? []).filter((line) => line.trim() !== '')
  const codeX = (QR_POSTER_WIDTH - CODE_SIZE) / 2
  const codeY = 52 + lines.length * 9
  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(QR_POSTER_WIDTH)}mm" height="${String(QR_POSTER_HEIGHT)}mm" ` +
      `viewBox="0 0 ${String(QR_POSTER_WIDTH)} ${String(QR_POSTER_HEIGHT)}" font-family="Arial, Helvetica, sans-serif" ` +
      'fill="#000000">',
    `<title>${escapeSvgText(content.title)}</title>`,
    `<rect width="${String(QR_POSTER_WIDTH)}" height="${String(QR_POSTER_HEIGHT)}" fill="#ffffff"/>`,
    textLine(content.title, 40, 14, 'bold'),
    ...lines.map((line, index) => textLine(line, 52 + index * 9, 7, 'normal')),
    `<svg x="${String(codeX)}" y="${String(codeY)}" width="${String(CODE_SIZE)}" height="${String(CODE_SIZE)}" ` +
      `viewBox="0 0 ${String(view)} ${String(view)}" shape-rendering="crispEdges">`,
    `<rect width="${String(view)}" height="${String(view)}" fill="#ffffff"/>`,
    `<path d="${qrSvgPath(matrix)}" fill="#000000"/>`,
    '</svg>',
    textLine(content.value, codeY + CODE_SIZE + 10, 4.5, 'normal'),
    '</svg>',
  ]
  return `${parts.join('\n')}\n`
}
