import type { NextConfig } from 'next'
import { builtinModules } from 'node:module'
import { resolveAllowedDevOrigins } from './src/lib/dev-origins'
import { telemetryServerExternalPackages } from '@open-mercato/telemetry/nextjs-config'

const isDevelopment = process.env.NODE_ENV !== 'production'
const allowedDevOrigins = isDevelopment ? resolveAllowedDevOrigins() : []

// Defensive hardening (refs #6132): `transpilePackages` below makes
// webpack/Turbopack process these packages' TypeScript source as first-party
// bundled code instead of treating them as opaque node_modules externals,
// which can skip the default server-target externalization for `node:`
// -prefixed builtin imports (e.g. `node:crypto` in @open-mercato/core's auth
// token hashing) in some bundler/version combinations — webpack would throw
// UnhandledSchemeError and Turbopack would hang. The bare specifier form
// (`crypto`) is unaffected, so rewrite `node:<name>` to `<name>` for every
// Node builtin rather than editing every affected import. This is a no-op
// when the bundler already resolves `node:` imports correctly.
const nodeProtocolResolveAlias = Object.fromEntries(
  builtinModules
    .filter((name) => !name.startsWith('_') && !name.startsWith('node:'))
    .map((name) => [`node:${name}`, name]),
)

// Local patch (engineering standards S8.4, #463): the production CSP drops `'unsafe-eval'` — the production build and
// the integration suite run without it. Development keeps it, because React's development build and Fast Refresh
// evaluate code at runtime; `src/instrumentation-client.ts` turns off zod's eval probe in the browser. A nonce-based
// CSP (no `'unsafe-inline'`) is deferred: it forces dynamic rendering.
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "font-src 'self' data: https:",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
  "img-src 'self' data: blob: https:",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ''} https://js.stripe.com`,
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' https: ws: wss:",
].join('; ')

// S8.4 headers added on top of the scaffold's. HSTS only in production: a browser ignores it over plain HTTP, but a
// development server behind local HTTPS would pin `localhost` for two years. `preload` waits for the production domain
// (club research D-012).
const strictTransportSecurity = 'max-age=63072000; includeSubDomains'
const permissionsPolicy = 'camera=(), microphone=(), geolocation=(), browsing-topics=()'

// S8.4: authenticated responses are not cacheable. Dynamic pages already get Next.js's `private, no-store`; API
// responses get no `Cache-Control` from the platform (spike #448, item 12). A request that carries a session cookie,
// a bearer token or an API key is authenticated; the sessionless public JSON routes (`public, s-maxage=60`) keep
// their shared caching for anonymous visitors.
const AUTHENTICATED_REQUEST_MARKERS = [
  { type: 'cookie', key: 'auth_token' },
  { type: 'cookie', key: 'session_token' },
  { type: 'header', key: 'authorization' },
  { type: 'header', key: 'x-api-key' },
] as const

// S8.9 (#744): `src/proxy.ts` runs on `/api` for the cross-site check, and Next.js buffers the body of every proxied
// request and silently truncates it at `proxyClientMaxBodySize` (default 10 MB): a larger upload reached its route cut
// short and was answered `400 Invalid multipart/form-data`. The proxy reads headers only, so the cap is the largest
// body the API accepts: the platform attachment limit (`OM_ATTACHMENT_MAX_UPLOAD_MB`, default 25 MB) plus its 1 MB
// multipart allowance, as `resolveAttachmentMultipartMaxBytes` of `@open-mercato/core` attachments computes it. Every
// Vereino upload limit is lower (10 MB at most).
const ATTACHMENT_MAX_UPLOAD_MB_DEFAULT = 25
const MULTIPART_OVERHEAD_BYTES = 1024 * 1024
const attachmentMaxUploadMb = Number(
  process.env.OM_ATTACHMENT_MAX_UPLOAD_MB ?? process.env.OPENMERCATO_ATTACHMENT_MAX_UPLOAD_MB,
)
const proxyClientMaxBodySize =
  Math.floor(
    (Number.isFinite(attachmentMaxUploadMb) && attachmentMaxUploadMb > 0
      ? attachmentMaxUploadMb
      : ATTACHMENT_MAX_UPLOAD_MB_DEFAULT) *
      1024 *
      1024,
  ) + MULTIPART_OVERHEAD_BYTES

const nextConfig: NextConfig & { agentRules?: boolean } = {
  distDir: '.mercato/next',
  // Mirror apps/mercato: scaffolded apps ship their own AGENTS.md/CLAUDE.md
  // from the template, so let Next 16.3+ leave them alone rather than
  // appending its managed agent-rules block on every `next dev`.
  agentRules: false,
  experimental: {
    serverMinification: false,
    turbopackMinify: false,
    // Mirror apps/mercato: treat these barrel-heavy packages as having
    // modularized exports so only the named exports actually used are
    // evaluated. Keeps scaffolded apps on the same client-bundle baseline.
    //   - lucide-react: icons used across the default backend components.
    //   - recharts: pairs with the next/dynamic chart split in @open-mercato/ui.
    //   - date-fns: already deep-imported; listed here as defense-in-depth.
    optimizePackageImports: ['lucide-react', 'recharts', 'date-fns'],
    proxyClientMaxBodySize,
    ...(isDevelopment
      ? {
          preloadEntriesOnStart: false,
        }
      : {}),
  },
  allowedDevOrigins: allowedDevOrigins.length > 0 ? allowedDevOrigins : undefined,
  turbopack: {
    resolveAlias: nodeProtocolResolveAlias,
  },
  webpack: (config, { isServer, webpack }) => {
    if (isServer) {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource: { request: string }) => {
          resource.request = resource.request.replace(/^node:/, '')
        }),
      )
    }
    return config
  },
  // Transpile @open-mercato packages that have TypeScript in src/
  // Note: @open-mercato/shared is excluded as it has pre-built dist/ files
  transpilePackages: [
    '@vereino/core',
    '@vereino/db',
    '@vereino/ui',
    '@open-mercato/core',
    '@open-mercato/ui',
    '@open-mercato/events',
    '@open-mercato/cache',
    '@open-mercato/queue',
    '@open-mercato/search',
    '@open-mercato/content',
    '@open-mercato/onboarding',
    '@open-mercato/ai-assistant',
  ],
  serverExternalPackages: [
    'esbuild',
    '@esbuild/darwin-arm64',
    '@open-mercato/cli',
    'puppeteer-core',
    'jszip',
    'yjs',
    // Telemetry: the OTEL SDK + instrumentations must run as real Node modules,
    // not be bundled — the auto-instrumentations (pg/undici) monkey-patch the
    // underlying drivers at runtime. The full list is owned by
    // @open-mercato/telemetry so it can never drift into a partial (silently
    // "emits nothing") copy.
    ...telemetryServerExternalPackages,
  ],
  // Mirror server-only env vars that client components must observe. Keep this
  // list minimal — anything added here is inlined into the client bundle.
  env: {
    OM_SEARCH_MIN_LEN: process.env.OM_SEARCH_MIN_LEN,
  },
  async headers() {
    const originHeaderName = (process.env.CUSTOMER_DOMAIN_ORIGIN_HEADER ?? 'X-Open-Mercato-Origin').trim()
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: permissionsPolicy },
          ...(isDevelopment ? [] : [{ key: 'Strict-Transport-Security', value: strictTransportSecurity }]),
        ],
      },
      ...AUTHENTICATED_REQUEST_MARKERS.map((marker) => ({
        source: '/api/:path*',
        has: [marker],
        headers: [{ key: 'Cache-Control', value: 'private, no-store' }],
      })),
      {
        // Attachment file downloads set their own restrictive CSP (sandbox)
        // in the route handler — override the global app CSP so it is not
        // replaced at the Next.js config layer.
        source: '/api/attachments/file/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "default-src 'none'; sandbox" },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
      {
        // The personal declaration link page (`activities`, REQ-017, #192): the raw token is in the address, so no
        // request from the page (a link, an image, a script) may carry it on as a referrer.
        source: '/club/d/:token*',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
      {
        // Its API (`GET`, `POST /api/activities/declaration-links/{token}`): set here, because these config headers
        // override a header the route handler sets.
        source: '/api/activities/declaration-links/:token',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
      {
        // The request confirmation page carries the e-mailed token in its path: no browser may send it on as a
        // referrer, and no cache may keep the page (facilities spec DD-44, #125).
        source: '/p/:clubSlug/requests/verify/:token',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
      {
        // The renter's cancellation page carries the e-mailed token in its path, like the request confirmation
        // (facilities parity spec REQ-R17, DD-R13; #286).
        source: '/p/:clubSlug/rentals/cancel/:token',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
      {
        // The service worker of the installed app (D-045, #873): a browser checks it for a new version on every visit.
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache' }],
      },
      {
        // The application confirmation and status pages carry the e-mailed token in their path, like the request
        // confirmation (section sign-up form spec P-J3, P-J4, DD-J06, DD-J07; #799).
        source: '/p/:clubSlug/applications/:page(confirm|status)/:token',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
      {
        // Marker header consumed by the custom-domain DNS reverse-resolve check
        // (see SPEC 2026-04-08-portal-custom-domain-routing). Lets the verifier
        // tell "request reached our origin" from "request was answered by an
        // unrelated host that proxied it through Cloudflare/Fastly".
        source: '/_next/health',
        headers: [{ key: originHeaderName, value: '1' }],
      },
    ]
  },
}

export default nextConfig
