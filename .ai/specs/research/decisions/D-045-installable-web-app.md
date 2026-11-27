---
number: D-045
date: 2026-11-26
owner: Władek Kuć
source: om-discover refresh session with Claude Code, 2026-11-26 (owner's request in chat after the first club presentation)
status: confirmed
---
# D-045 Vereino is an installable web app (PWA) with the club's name and logo; push and a native app stay out

## Context

- During the first club presentation (2026-11-26) the owner promised "an icon on the phone". The coach did not ask for
  it, so this decision rests on the owner's choice, not on an observed need.
- N12 excluded a native app and PWA packaging from 1.0, and N02 excludes push. On `main` the app has no web app
  manifest, no icons for installation and no service worker, so browsers offer no installation.
- Each club runs on its own origin `{club}.vereino.org` (D-036), so each club can be installed as its own app.

## Decision

1. Vereino becomes an **installable web app** on phones and computers:
   - a web app manifest per club origin: the club's name and logo, start URL, standalone display, theme colour and
     icons (192 and 512 px);
   - a minimal service worker that shows an offline page, with no offline data;
   - an optional "Install" entry in the menu where the browser supports the install prompt;
   - a short "Share → Add to Home Screen" hint on iPhone, where Safari shows no prompt.
2. **Push notifications stay out** (N02), and so does **a native app** (the rest of N12).
3. N12 is narrowed by this decision, not removed.

## Consequences and review

- One backlog story: manifest, icons, service worker, install hint, tests.
- Review when push is reconsidered (N02) or a native app is requested.
