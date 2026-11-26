import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import {
  createContentSecurityPolicyRequestHeaders,
  devServerLoopbackFrameAncestorOrigins,
} from '@open-mercato/shared/lib/security/contentSecurityPolicy'
import { stripeContentSecurityPolicy } from '@open-mercato/gateway-stripe/contentSecurityPolicy'
import { resolveDocumentsCollaborationCspOrigins } from '@open-mercato/documents/contentSecurityPolicy'
import { CROSS_SITE_REQUEST_ERROR_CODE, crossSiteApiVerdict } from '@vereino/core'

// Do NOT import bootstrap here — proxy runs in the Edge runtime and
// cannot use Node.js-only modules like MikroORM. Bootstrap runs in layouts.
export function proxy(req: NextRequest) {
  if (req.nextUrl.pathname === '/api' || req.nextUrl.pathname.startsWith('/api/')) {
    // S8.9, ENG-Q-11 (#744): a cookie-authenticated mutation from a foreign origin or a cross-site fetch is refused
    // before it reaches the platform API dispatcher; bearer, API-key and webhook requests are exempt.
    const verdict = crossSiteApiVerdict({
      method: req.method,
      pathname: req.nextUrl.pathname,
      header: (name) => req.headers.get(name),
      env: process.env,
    })
    if (!verdict.allowed) {
      return NextResponse.json(
        { error: 'Cross-site request refused', code: CROSS_SITE_REQUEST_ERROR_CODE },
        { status: 403, headers: { 'cache-control': 'no-store' } },
      )
    }
    return NextResponse.next()
  }
  // Pages get the platform CSP with a per-request nonce (Open Mercato 0.10); the root layout reads it from `x-nonce`.
  const { requestHeaders, contentSecurityPolicy } = createContentSecurityPolicyRequestHeaders(req.headers, {
    env: process.env,
    ...stripeContentSecurityPolicy,
    connectOrigins: [...stripeContentSecurityPolicy.connectOrigins, ...resolveDocumentsCollaborationCspOrigins()],
    frameAncestorOrigins:
      process.env.OM_DEV_SERVER_LOOPBACK_FRAMING === '1' ? devServerLoopbackFrameAncestorOrigins : [],
  })
  requestHeaders.set('x-next-url', req.nextUrl.pathname)
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', contentSecurityPolicy)
  return response
}

// Match app routes while skipping Next internals and static assets, plus every `/api` route for the cross-site check.
// The x-next-url header lets server layouts above dynamic segments resolve the
// request pathname without receiving params, preventing full client-tree
// remounts on navigation (see issue #1083).
export const config = {
  matcher: [
    '/((?!api/|_next/|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map|txt|xml|json|woff|woff2|ttf|eot)$).*)',
    '/api/:path*',
  ],
}
