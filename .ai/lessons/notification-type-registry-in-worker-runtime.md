---
title: "The platform's notification type registry is filled only in the web runtime, so a module whose in-app type is delivered by dispatch registers it in di.ts"
modules: ["communication", "foundation", "platform", "notifications"]
areas: ["integration", "architecture"]
topics: ["workers", "notifications", "di", "dispatch"]
---

# The platform's notification type registry is filled only in the web runtime, so a module whose in-app type is delivered by dispatch registers it in di.ts

**Context**: Foundation III phase B (#35, 2026-11-02) sends `communication.announcement` in-app notices through the foundation's dispatch worker.

**Problem**: The platform fills its notification type registry (`registerNotificationTypes`, `notification-type-registry.js`) only during the web runtime's bootstrap. In the queue worker process `getNotificationType('communication.announcement')` returned nothing, so every in-app delivery ended `failed` / `render_failed`. Phase A's tests had passed because the probe module registers its own type in the test process, which hid the gap.

**Rule**: A Vereino module whose in-app types are delivered by `dispatch` calls `registerNotificationTypes(notificationTypes)` in its `di.ts` `register` (additive, keyed by type id, safe to repeat). A messaging test asserts an in-app delivery `sent` for a real module type, not only for a probe type.

**Applies to**: every module that adds in-app notification types delivered from a worker (`communication`, and later modules using dispatch).
