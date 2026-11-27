---
title: "Platform 0.9.0 shows setNavBadge counts only in section sidebars; the app draws them on main items"
modules: ["platform", "activities", "payments", "facilities"]
areas: ["backend-ui"]
topics: ["navigation", "nav-badges", "platform-upgrade", "integration-tests"]
---

# Platform 0.9.0 shows setNavBadge counts only in section sidebars; the app draws them on main items

**Context**: On #413 (issue #260, 2026-11-19) the menu-count widgets published into `setNavBadge` correctly, and the API half of TEST-N04 passed. In CI, `TEST-N04 UI` failed on both attempts because the sidebar had no count. In `@open-mercato/ui@0.9.0` (the npm `latest`), `AppShell.tsx` renders `<NavItemBadge>` only in `renderSectionItem`, which draws the settings and profile section sidebars. Main items and their children render no badge. The `0.10.1-develop` line renders it on all three.

**Problem**: The store's doc comment and the `backend:nav:badges` spot suggest every sidebar item shows its count. A spec or a widget built on that premise passes unit and API tests but shows nothing, and a host without Chromium cannot catch it locally.

**Rule**: Before relying on a platform rendering seam, find where the installed `AppShell` (or host component) actually reads it. Grep the installed `node_modules/@open-mercato/ui/src`, not the docs or the `develop` source. From #413 to the 0.10.1 upgrade, `packages/app/src/components/SidebarNavBadges.tsx` (mounted in the backend layout) drew the platform chip from the same store. `@open-mercato/ui@0.10.1` renders main-item counts itself, and the bridge was deleted in the upgrade PR (#887, #498) after TEST-N04 failed in CI with two chips per item (strict-mode violation on the chip's label). A bridge for a missing platform seam is removed in the upgrade PR that brings the seam; grep the bridge's own comment for the release it waits on. TEST-N04 catches both cases.

**Applies to**: `setNavBadge` / `useNavBadge`, `backend:nav:badges` widgets, the removed `SidebarNavBadges.tsx` bridge, `@open-mercato/ui` upgrades.
