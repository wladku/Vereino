---
title: "A frontend module page gets server data from its own API handler and metadata from a static generateMetadata"
modules: ["club_core", "facilities", "foundation", "platform"]
areas: ["backend-ui", "architecture"]
topics: ["ssr", "metadata", "open-graph", "public-pages", "no-javascript", "react-query"]
---

# A frontend module page gets server data from its own API handler and metadata from a static generateMetadata

**Context**: #487 (E20-S08). The public club pages rendered a client view that fetched its data in the browser, so
without JavaScript (and for link previews and search engines) they showed only a skeleton and the route's static title
"Strona klubu".

**Problem**: The frontend catch-all `src/app/(frontend)/[...slug]/page.tsx` loads a module page through the generated
route manifest, whose `load()` hands over only the page's **default export**: a `generateMetadata` module export (as in
the scaffold's `example/frontend/blog/[id]/page.tsx`) is never called. Reading the data on the server by calling the
service directly would bypass the API route's response mapping and its rate limit.

**Rule**:
- A frontend page that needs dynamic metadata attaches it as a static property of its default export:
  `Page.generateMetadata = (props) => Promise<Metadata | null>`. The catch-all calls it only for routes without
  `requireAuth`/`requireCustomerAuth` and merges it over the route's own title; null keeps the route title.
- A page that renders public data on the server reads it with `loadPublicRoute` from `@/modules/foundation`, passing
  its own API handler `GET` and `metadata.GET.rateLimit` — the API stays the single data source and the rate limit
  applies to the page too. Wrap the loader in React `cache` so the metadata and the page share one read.
- Map the answer with the same pure function the browser fetch uses (`club_core/lib/public-load.ts`,
  `facilities/lib/public-load.ts`) and pass it to the client view as `initial`. The view renders `initial ?? query.data`
  and turns its query off (`enabled: false`) while it has `initial`. Never seed it with `initialData` or
  `setQueryData`: `@open-mercato/ui`'s `QueryProvider` holds one module-level `QueryClient`, so on the server every
  request shares one query cache, and a query that already has data ignores `initialData`. In #487 the page body kept
  the first render of a slug for every later request (a club that stopped publishing still showed its page while the
  API and the metadata answered 404). A query keyed by a search parameter takes `initial` only for the parameter it was
  read for.
- The catch-all forwards `searchParams` to the page component; prove "works without JavaScript" with a Playwright
  context created with `javaScriptEnabled: false` (`E20-S08-public-pages-without-js.spec.ts`).

**Applies to**: `packages/app/src/app/(frontend)/[...slug]/page.tsx`, `packages/app/src/modules/*/frontend/**/page.tsx`,
`foundation/services/public-route-load.ts`, the public pages P-01, P-02, P-03, P-06 and P-T1.
