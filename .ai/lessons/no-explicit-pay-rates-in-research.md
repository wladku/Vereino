---
title: "Keep explicit pay rates out of research notes in this public repository"
modules: ["platform"]
areas: ["spec-pr"]
topics: ["discovery", "research-notes", "privacy", "public-repository"]
---

# Keep explicit pay rates out of research notes in this public repository

**Context**: On 2026-10-23 an interview note with the academy coordinator recorded the coaches' monthly base pay and the per-session deduction as amounts. The founders' meeting note already carried an example per-match fee. The product owner corrected this: no explicit rates may appear.

**Problem**: `wladku/Vereino` is a public repository, and an interview transcript naturally contains what people are paid. Once a rate is committed, it stays in the git history even after it is edited out.

**Rule**: When writing research notes, briefs, specs or decision records:
- Describe how pay is structured (a fixed base, a fixed amount per session, a fixed amount per trip) without the amounts.
- This covers coaches' and staff pay, contract rates and any other compensation of named or identifiable people.
- Public list prices of competitors and rates from published regulations are not covered. Ask the product owner when unsure.
- Check a note for amounts before it is committed.

**Applies to**: `.ai/specs/research/**`, `.ai/specs/product-brief.md`, `.ai/specs/*.md`, and the `om-discover`, `om-spec-writing` and `om-brainstorm` sessions.
