// Monochrome provider marks tinted by `currentColor` (spec *UI architecture*; #566); decorative, the button text names
// the provider.
import * as React from 'react'
import type { IdentityProvider } from '../lib/identity'

export function ProviderMark({ provider }: { provider: IdentityProvider }) {
  if (provider === 'google') {
    return (
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className="size-4 shrink-0" fill="currentColor">
        <path d="M21.6 12.23c0-.68-.06-1.36-.18-2.02H12v3.83h5.39a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.89-1.74 2.98-4.3 2.98-7.33ZM12 22c2.7 0 4.97-.9 6.62-2.43l-3.23-2.5c-.9.6-2.05.95-3.39.95-2.6 0-4.81-1.76-5.6-4.12H3.07v2.58A10 10 0 0 0 12 22Zm-5.6-8.1a6 6 0 0 1 0-3.8V7.52H3.07a10 10 0 0 0 0 8.96l3.33-2.58ZM12 5.98c1.47 0 2.79.5 3.83 1.5l2.86-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.52L6.4 10.1C7.19 7.74 9.4 5.98 12 5.98Z" />
      </svg>
    )
  }
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className="size-4 shrink-0" fill="currentColor">
      <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.45 2.89h-2.33v6.99A10 10 0 0 0 22 12Z" />
    </svg>
  )
}
