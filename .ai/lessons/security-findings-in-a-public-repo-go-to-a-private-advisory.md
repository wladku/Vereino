---
title: "Security findings in this public repository go to a private advisory, with a detail-free public issue"
modules: ["platform"]
areas: ["debugging", "spec-pr"]
topics: ["security-report", "disclosure", "advisory"]
---

# Security findings in this public repository go to a private advisory, with a detail-free public issue

**Context**: The owner asked the internal security review (#743, 2026-11-26) to "file an issue for every finding at high or critical". The repository is public. `SECURITY.md` forbids public issues for vulnerabilities, and the `om-auto-sec-report` disclosure policy (`withhold-live`) keeps live high and critical findings out of every published surface.

**Problem**: A normal issue for a live high finding publishes its location and cause before a fix exists. The opposite mistake is to keep the finding only in a local, git-ignored withheld file: it then never reaches the tracker, and the next run cannot see it.

**Rule**: For a live high or critical finding:
- Create a draft repository security advisory (`gh api -X POST repos/{owner}/{repo}/security-advisories`, ecosystem `other`) holding the withheld entry. Leave out the `disclosure-tokens` block.
- File a public issue that names only the finding id, its severity, its OWASP category and coarse reachability, and points to the advisory by finding id.
- Give the public issue no `cezar` label: an autonomous run cannot read the advisory.
- In the committed report, cite the issue number next to the placeholder.
- Before publishing, re-read the unit fragments for indirect hints (vector names, recommended lines) and reword them. The token-based disclosure check does not catch paraphrases.

**Applies to**: `om-auto-sec-report`, `om-auto-sec-report-pr`, `.ai/analysis/sec-report-*.md`, any run that files security findings for this repository.
