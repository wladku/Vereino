---
title: "OM_TEST_MODE counts as e-mail delivery disabled, its capture does not render components, and an encrypted lookup hash needs its property present at insert"
modules: ["foundation", "platform"]
areas: ["integration", "testing", "module-data"]
topics: ["email", "test-mode", "encryption", "capture"]
---

# OM_TEST_MODE counts as e-mail delivery disabled, its capture does not render components, and an encrypted lookup hash needs its property present at insert

**Context**: The dispatch tests of foundation III phase A (#71, 2026-11-02) read sent e-mails from the `OM_TEST_MODE` capture file.

**Problem**:
- Under `OM_TEST_MODE`, `isEmailDeliveryDisabled()` returns true (`shared/src/lib/email/config.ts`) while `sendEmail` still captures (`send.ts`), so a "skip when delivery is disabled" check recorded every test e-mail as skipped.
- `collectEmailText` and `collectEmailLinks` walk the React tree as given and do not call function components, so the layout's club name and footer were missing from the capture.
- The capture's `text` is the React tree's text nodes joined with single spaces, not the template's own `text()`: the J-003 journey (#23, 2026-11-02) had to assert "Powód: Ulewa", not "Powód:
Ulewa".
- The tenant encryption service fills a hash sibling such as `email_hash` only when the property already exists on the entity data (`findKey`, `tenantDataEncryptionService.ts`), so a row inserted without it got no hash.

**Rule**: Read `OM_DISABLE_EMAIL_DELIVERY` explicitly for "delivery off"; expand function components before handing a tree to `sendEmail`; set the hash property (null) at insert for every encrypted field with a lookup hash.

**Applies to**: every Vereino e-mail through `dispatch`, its integration tests, and entities with encrypted lookup fields.
