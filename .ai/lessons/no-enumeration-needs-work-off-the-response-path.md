---
title: "A no-enumeration route runs its lookup-dependent work after the response, not behind a minimum delay"
modules: ["activities"]
areas: ["module-data", "debugging"]
topics: ["enumeration", "timing", "sessionless", "public-pages", "next-after"]
---

# A no-enumeration route runs its lookup-dependent work after the response, not behind a minimum delay

**Context**: `POST /api/activities/declaration-links` (#105, PR #182) answers the same 202 whether or not an address is known. To hide the timing difference, it waited until at least 1 s had passed. The work for a known address ran inline: a transaction that issues the token and enqueues the dispatch, plus a publish for each matched person. The #182 review (follow-up #192) pointed out that a minimum delay only hides the difference while that work stays under the minimum. A slow database, or a family with several matched persons, pushes it past 1 s, and the response time then reveals the address.

**Problem**: A fixed floor looks like it closes a timing side channel, and it passes every test in a quiet environment. It stops working exactly when the system is under load. Raising the floor and adding jitter only moves the threshold. Moving the work to a queue job instead puts the personal data the route protects (the address) into a job payload.

**Rule**: When a route must not reveal whether a lookup matched, answer before any work that depends on the match. In a Next.js route handler, validate the input, then schedule the work with `after()` from `next/server`, which runs it in the same process after the response is sent and needs no payload store. Keep any floor only as a constant on top of that. Catch and report failures inside the `after` callback, because nothing can show them to the caller. Accept, and document, that a crash between the response and the work loses that one request. Integration tests then wait for the effect, for example with `awaitEmails`, instead of expecting it when the response arrives. Import it as `import * as nextServer from 'next/server'` and call `nextServer.after(…)`. The OpenAPI generator in `yarn generate` bundles every route against a `next` stub that has no `after`. A named `import { after }` fails that whole bundle, and the only symptom is the log line "Bundling failed; falling back to static regex extraction", after which every route's request and response schemas are dropped from `openapi.generated.json`. A namespace member only produces a warning.

**Applies to**: Sessionless request routes that must not reveal a match, such as `activities/api/declaration-links/route.ts`, and any future "send me a link", password-reset-style or invitation request route.
