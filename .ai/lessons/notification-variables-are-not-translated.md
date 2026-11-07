---
title: "Notification variables are not translated: a role or status word in a notice needs its own body key"
modules: ["activities", "notifications", "platform"]
areas: ["module-data"]
topics: ["notifications", "i18n", "body-key", "acting-role"]
---

# Notification variables are not translated: a role or status word in a notice needs its own body key

**Context**: #139 (2026-11-06) had the in-app cancellation notice name who cancelled and in which role (R01). The notice is built with `buildBatchNotificationFromType`.

**Problem**: The platform renders `t(bodyKey, body, bodyVariables)` in the reader's locale, but the variables are inserted as they are. A `{role}` variable holding `coach` would show the English code to a Polish reader. `buildBatchNotificationFromType` always takes `bodyKey` from the type definition.

**Rule**:
- Keep only club text and names in the variables.
- For a word that must be translated (a role, a status), write one catalog key per value (`…occurrenceCancelled.bodyByCoach`, `…bodyByCoordinator`, `…bodyByAdmin`). Override the built notification's key: `{ ...buildBatchNotificationFromType(type, …), bodyKey, body: bodyKey }`.
- Fall back to the type's own body when the value is unknown. Notifications already stored keep their key.

**Applies to**: `activities/services/cancellation-notice.ts` and every Vereino notification whose text depends on a translated value.
