---
title: "An SVG in public/ carries the literal token values, never CSS variables or palette colours"
modules: ["platform", "club_core"]
areas: ["backend-ui"]
topics: ["svg", "design-tokens", "ds-check", "logo"]
---

# An SVG in public/ carries the literal token values, never CSS variables or palette colours

**Context**: #485 (E20-S06). The shell logo `public/open-mercato.svg` was a Tailwind blue-700 square with a yellow-400 dot, and `ds:check` only scanned `src/**/*.ts(x)`, so nothing caught it. The platform `AppShell` and the sign-in card load the logo with `<Image src=…>` — an image document.

**Problem**: An SVG loaded as an image is a separate document: it cannot read the page's CSS variables (`fill="var(--primary)"` falls back to black) nor the app's `.dark` class. Hex palette colours look fine and slip past code review.

**Rule**: Paint an SVG in `packages/app/public/` only with the exact values declared for a token in `src/app/globals.css` (for example `oklch(0.205 0 0)` = light `--primary`), in a `<style>` block, with the dark values under `@media (prefers-color-scheme: dark)`. `ds:check` (`scripts/vereino-svg-tokens.mjs`) rejects any other colour; when a token value changes, update the SVGs in the same PR. An icon that must follow the app's own theme switch is an inline React SVG with `currentColor`, not a file in `public/`.

**Applies to**: `packages/app/public/*.svg` (`vereino-mark.svg`, its copy `open-mercato.svg` kept for the platform sign-in card), `packages/app/scripts/ds-check.mjs`.
