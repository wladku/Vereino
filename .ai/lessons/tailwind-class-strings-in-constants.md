---
title: "Build conditional Tailwind class names from constants; the formatter trims whitespace inside a className template literal"
modules: ["ui", "platform"]
areas: ["backend-ui"]
topics: ["prettier", "tailwind", "classname", "template-literal", "formatting"]
---

# Build conditional Tailwind class names from constants; the formatter trims whitespace inside a className template literal

**Context**: Issue #101 (2026-11-03) wrote ``className={`mx-auto … py-6${nav ? ' pb-28' : ''}`}`` on the member shell's `<main>`.

**Problem**: `yarn format` sorts and trims the classes inside a `className` template literal, including the string literals in its expressions, so `' pb-28'` became `'pb-28'` and the result was `py-6pb-28`: two broken classes, no error, and the page lost its padding. Only an exact-markup unit test caught it.

**Rule**: Never put a leading or trailing space in a string inside a `className` expression. Name each variant as a constant (`const MAIN_WITH_BAR_CLASS = `${MAIN_CLASS} pb-28``) and pick one with a plain ternary, and assert the rendered class string in a unit test.

**Applies to**: every `.tsx` in `packages/ui` and `packages/app/src/modules/**` that builds class names conditionally.
