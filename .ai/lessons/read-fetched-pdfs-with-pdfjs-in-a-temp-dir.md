---
title: "Read fetched source PDFs with pdfjs-dist in a temp directory, not WebFetch"
modules: ["platform"]
areas: ["research"]
topics: ["pdf", "spec-research", "web-fetch"]
---

# Read fetched source PDFs with pdfjs-dist in a temp directory, not WebFetch

**Context**: For the E24 spec (#672) the PZPN certification rules, the Elite guidance and the U6–U13 training
programme exist only as PDFs on `cdn.laczynaspilka.pl`. WebFetch returned them as compressed binary and the fetch agent
reported "not verified" for every question. The server has no `pdftotext`, no `pdftoppm` (so the Read tool cannot
render PDFs over 10 pages) and no `pip`.

**Problem**: Without the text, a spec ends up designing export columns and templates from memory, which the source
may contradict.

**Rule**: When a source is a PDF, copy the saved bytes into a fresh temp directory and extract text with
`pdfjs-dist` installed into another temp directory (`npm install --prefix <tmp>/nodelib pdfjs-dist@4.10.38`, then
`getDocument(...).getPage(i).getTextContent()` from a script kept outside the PDF folder). Never add it to a workspace.
Images inside the PDF (such as sample forms) stay unreadable; record those as verification items in the spec rather than
guessing their labels.

**Applies to**: spec research (`om-spec-writing`, `om-auto-write-spec`) on Linux servers without poppler.
