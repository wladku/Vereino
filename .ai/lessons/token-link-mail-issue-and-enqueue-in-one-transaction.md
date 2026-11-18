---
title: "Issue an e-mailed token link and enqueue its dispatch in one transaction; roll both back when the key is taken"
modules: ["facilities", "foundation"]
areas: ["module-data", "architecture"]
topics: ["token-link", "dispatch", "idempotency", "subscribers"]
---

# Issue an e-mailed token link and enqueue its dispatch in one transaction; roll both back when the key is taken

**Context**: #286 sends the renter's summary and "moved" e-mails from persistent subscribers, each carrying a fresh P-10 cancellation link. The raw token may live only in the dispatch delivery's encrypted secret (DD-44), so the subscriber, not the command, must create the link.

**Problem**: A persistent subscriber can run twice for one event. Issuing (or re-issuing) the link first and then calling `dispatch.enqueue` with the same idempotency key replaces the stored hash while the second enqueue answers `created: false` — the e-mail already sent then holds a dead link, and the new token is lost.

**Rule**: Create the link and enqueue the e-mail in the same `em.transactional`; when `enqueue` answers `created: false`, throw a private sentinel inside the transaction so the new link rolls back with it, and catch the sentinel outside to report "already sent". Key a per-occurrence e-mail (a move) by an id carried in the event payload (`moveId`), never by the row's `updatedAt`, which later actions change.

**Applies to**: `facilities/services/rental-links.ts` (`sendRenterMail`), any subscriber that e-mails a `createTokenLinkService` link.
