---
title: "Scripted file edits on Windows write bytes, so a CRLF never enters an LF repository"
modules: ["platform"]
areas: ["architecture"]
topics: ["windows", "line-endings", "crlf", "scripted-edits"]
---

# Scripted file edits on Windows write bytes, so a CRLF never enters an LF repository

**Context**: In #93 an agent edited a dozen files with a Python helper (`open(p).read()` / `open(p, 'w').write(...)`) on Windows. Every touched file came back with CRLF line endings; `git diff` warned "CRLF will be replaced by LF" for each one and the whole file showed as changed until it was normalized.

**Problem**: Python's text mode translates `\n` to `\r\n` on write on Windows (and `json.dumps` output goes through the same path). The repository is LF-only, so the diff and `yarn format:check` see every line as modified, and a partial normalization leaves mixed files.

**Rule**: In scripted edits on Windows, read and write bytes (`open(p, 'rb')` / `open(p, 'wb')` with explicit `.decode('utf-8')` / `.encode('utf-8')`) or pass `newline='\n'` when writing text. Prefer the Edit tool for small changes. After any scripted edit, check `git diff --stat` for CRLF warnings before running the gate.

**Applies to**: any agent run on the Windows workstation that edits repository files through Python, Node or shell scripts instead of the editor tools.
