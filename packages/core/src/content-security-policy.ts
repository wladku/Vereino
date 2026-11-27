// Style hashes on top of the platform CSP (engineering standards S8.4; Open Mercato 0.10 upgrade, #498). The platform
// policy admits an inline `<style>` element only with the request's nonce, but Radix `Select.Viewport` (inside the
// platform `SelectContent` of `@open-mercato/ui/primitives/select`, which passes no nonce) always injects one fixed
// stylesheet that hides the list's scrollbar. Without its hash every opened select logs a CSP violation. A hash admits
// exactly that text and nothing else, so the policy stays as strict for any other inline style. Pure: the policy
// string is passed in.

/** The stylesheet Radix `SelectViewport` injects, byte for byte (`@radix-ui/react-select`). */
export const RADIX_SELECT_VIEWPORT_STYLE =
  '[data-radix-select-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-select-viewport]::-webkit-scrollbar{display:none}'

/** The CSP hash source of {@link RADIX_SELECT_VIEWPORT_STYLE} (sha256, base64). */
export const RADIX_SELECT_VIEWPORT_STYLE_HASH = "'sha256-441zG27rExd4/il+NvIqyL8zFx5XmyNQtE381kSkUJk='"

/**
 * The policy with `hashes` added to its `style-src` directive. Unchanged when it has no `style-src` or that directive
 * already allows `'unsafe-inline'` (development): a hash source would make the browser ignore `'unsafe-inline'`.
 */
export function withStyleHashes(policy: string, hashes: readonly string[]): string {
  const directives = policy.split(';').map((directive) => directive.trim())
  const index = directives.findIndex((directive) => directive.split(/\s+/)[0] === 'style-src')
  if (index < 0) return policy
  const sources = directives[index].split(/\s+/)
  if (sources.includes("'unsafe-inline'")) return policy
  directives[index] = [...new Set([...sources, ...hashes])].join(' ')
  return directives.join('; ')
}
