---
title: "Read Polish acts from the Sejm ELI service and EU acts from the Publications Office, and extract PDFs with pdfjs-dist"
modules: ["platform"]
areas: ["architecture"]
topics: ["compliance", "legal-sources", "research"]
---

# Read Polish acts from the Sejm ELI service and EU acts from the Publications Office, and extract PDFs with pdfjs-dist

**Context**: E19-S01 (#467, 2026-11-20) verified five legal claims from primary texts. Research C had left them unverified because ISAP was "behind CAPTCHA". In this run every `isap.sejm.gov.pl` page and download answered with a "Human Verification" page, every EUR-Lex URL (`eur-lex.europa.eu/legal-content/…`, `/eli/…`) answered HTTP 202 with an empty body, `uodo.gov.pl` failed TLS verification, and the web-fetch tool returned PDFs as unreadable binary. The `api.sejm.gov.pl/eli/acts/DU/<year>/<pos>/text.html` copy of a large act was cut off by the fetch tool before the articles needed.

**Problem**: An agent that stops at those errors marks a claim "could not verify" although the official text is freely available from another official endpoint, or falls back to secondary sources, which the compliance documents may not cite as evidence.

**Rule**:
- Polish acts: use the Sejm ELI API. `https://api.sejm.gov.pl/eli/acts/DU/<year>/<pos>` gives the metadata (status, consolidated texts, amending acts — read the amending acts listed after the consolidated text); `…/text.pdf` gives the official Dziennik Ustaw PDF; Monitor Polski is `…/acts/MP/<year>/<pos>/…` or `https://monitorpolski.gov.pl/M<year><pos 7 digits>01.pdf`. Search consolidated texts with `https://api.sejm.gov.pl/eli/acts/search?title=<words>&type=Obwieszczenie`.
- EU acts: `curl -L -H "Accept: application/xhtml+xml" -H "Accept-Language: eng" http://publications.europa.eu/resource/celex/<CELEX>` returns the Official Journal text (a consolidated version with its CELEX, e.g. `02002L0058-20091219`).
- PDFs: download with `curl` into a fresh directory outside the repository and extract the text with the installed `packages/app/node_modules/pdfjs-dist/legacy/build/pdf.mjs` (`getDocument` → `getTextContent` per page) from a script kept in another directory; search the text with Python `re` on whitespace-collapsed text, not `grep -o '.\{0,N\}'` on one long line (it hangs).
- Quote the article you read, name the consolidated text (Dz.U. year and position) and the date read; mark "could not verify" only when no official endpoint gave the text.

**Applies to**: `docs/compliance/*`, legal claims in specs and research, privacy notices, any agent run that cites Polish or EU law.
