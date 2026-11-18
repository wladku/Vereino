---
title: "A killed run leaves the worktree's git index.lock in the owner's checkout; and Python edits from Git Bash need newline='\\n'"
modules: ["platform"]
areas: ["debugging"]
topics: ["git", "worktree", "index-lock", "autonomous-runs", "windows", "line-endings"]
---

# A killed run leaves the worktree's git index.lock in the owner's checkout; and Python edits from Git Bash need newline='\n'

**Context**: The cezar run of #272 (2026-11-17) was killed (exit 137) while a command was running. After the restart every `git add` / `git commit` in the task worktree failed with `Unable to create 'C:/Users/wkuc/vereino/.git/worktrees/<id>/index.lock': File exists` — the lock had been left at 17:01 by the killed process. The same run edited files with Python from Git Bash.

**Problem**: (1) A linked worktree keeps its index and its `index.lock` under the main checkout's `.git/worktrees/<id>/`, which unattended runs must not touch, so the run cannot clear its own stale lock and cannot commit; the work stays uncommitted on disk. (2) On Windows Python's text mode writes `\r\n`, so a file rewritten with `open(path, 'w')` shows every line as changed; and a `\\n` inside a Python heredoc passed through the Bash tool reached the file as a real newline, which broke two string literals.

**Rule**: Commit after every finished slice, so a killed run loses at most one slice. When a stale `index.lock` of the task worktree blocks git, do not delete it from the run: keep working in the files, commit through a temporary index in the task's tmp directory (`export GIT_INDEX_FILE=<tmp>/git-index; git read-tree HEAD; git add …; git commit -s`), record it in the run log, and ask the owner to remove the lock (it is safe once no git process runs). Write files from Python with `open(path, 'w', encoding='utf-8', newline='\n')`, and put any edit that contains escape sequences or backticks in a script file (Write tool) instead of a shell heredoc.

**Applies to**: autonomous runs in cezar worktrees (`.ai/cezar/worktrees/*`), `.ai/runs/*`, edits made from Git Bash on Windows.
