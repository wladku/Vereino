> **Repo-local override.** This folder is a repo-local override for the external `om-open-pr` skill installed from `open-mercato/skills` via `yarn install-skills`. The external skill reads this file in place and applies the overrides below **on top of** its built-in workflow — it is never installed as a standalone skill. `AGENTS.md` and `SDLC.md` stay binding; everything tracker-facing goes through `.ai/trackers/github.md`.

# vereino overrides — `om-open-pr`

## 1. A `risk-high` PR that asks for QA carries the Polish QA instruction

When the label set this skill applies (or finds on a reused PR) contains both `risk-high` and `needs-qa`, the PR body MUST carry the owner's test instruction between the fixed markers, exactly as `SDLC.md` → "QA" defines it (QM-D01/QM-D02 of `.ai/specs/2026-11-24-qa-request-email.md`). Write it in the same step that adds `needs-qa`; never leave it for later. Without it the merge train holds the PR with the reason "QA instruction missing" and a second run has to be queued only to write it.

```markdown
<!-- qa-instruction:start -->
## Jak przetestować (QA)
**Co się zmienia:** 1–2 zdania prostym językiem.
**Przygotowanie:** `node C:\Users\wkuc\vereino-sandbox-env\sandbox.mjs preview <PR>` (5–10 min), potem http://127.0.0.1:4300; konto: … (rola, nie hasło).
**Kroki:**
1. Gdzie kliknąć i co ma się pokazać.
**Czego nie sprawdzisz:** np. płatność Stripe, klucze Google — i dlaczego.
**Po teście:** działa → etykieta `qa`; nie działa → `qa-failed` i komentarz, co poszło źle.
<!-- qa-instruction:end -->
```

Rules for the block:

- **Polish, for the owner, not for a developer.** No jargon, no test ids, no file paths; 3–7 numbered steps naming the menu, tab and button and what must appear (say where a control sits when it is easy to miss, for example "na dole zakładki *Dane*").
- **Fill in the PR number** in the preview command and name the account by role (for example "administrator klubu z danych demo"), never a password, token or e-mail address.
- **A PR without screens** says what the owner sees instead: "Nic do klikania — sprawdzenie to polecenie; sesja decyzyjna może je uruchomić za Ciebie." and names the command.
- **Czego nie sprawdzisz** lists what the preview cannot show (external providers, scheduled jobs, real e-mail) and why, or "nic".
- **Keep the block** whenever a later run rewrites the PR body (review fixes, `main` merges, label changes); update its steps when the change itself changes.
- **Never set `qa`, `qa-failed` or `qa-approved`** — only the owner does (`SDLC.md` → "Label state machine").

## 2. A run queued only to write the block

When the train's hold comment on a PR says **QA instruction missing** (hidden marker `<!-- merge-train:qa-instruction-missing -->`), the queued run reads the PR's diff, linked issue and spec, writes the block into the PR body with the tracker operation for editing a PR body, and changes no code and no labels. The train then edits its hold comment to link the block on its next pass.
