---
title: "Pass sendEmail a called e-mail component, not a createElement element"
modules: ["foundation", "people"]
areas: ["integration", "testing"]
topics: ["email", "send-email", "test-capture"]
---

# Pass sendEmail a called e-mail component, not a createElement element

**Context**: #303 sent the platform's `ResetPasswordEmail` as `react: React.createElement(ResetPasswordEmail, { resetUrl, copy })` through `foundation.emailSender`. The route answered 200 without a warning, but TEST-L01 and TEST-L02 found no new `/reset/` link in the `OM_TEST_MODE` capture.

**Problem**: The platform's `sendEmail` test capture (`@open-mercato/shared/lib/email/send.ts`, `collectEmailLinks`) walks the props of the element tree it is given. An unrendered component element has only `resetUrl` and `copy` as props, no `href` or children, so the captured e-mail has no links and no text, and a test that reads the link fails while the code looks correct.

**Rule**: Call platform e-mail components as functions — `react: ResetPasswordEmail({ resetUrl, copy })` — the way the platform's own routes do, so the tree handed to `sendEmail` is already expanded. Templates declared through the foundation's P-31 `defineEmailTemplate` are expanded by the dispatch worker (`expandEmailTree`) and need nothing extra.

**Applies to**: any direct `sendEmail` / `foundation.emailSender` call in `packages/app/src/modules/**` (today `foundation/services/accounts.ts` `resendInvitation`), and integration tests that read the e-mail capture.
