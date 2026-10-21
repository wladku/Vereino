---
number: D-009
date: 2026-09-29 (confirmed 2026-10-20)
owner: Władek Kuć
source: Claude's analysis (the Meta API does not support groups); confirmed by Władek in the spec's Q-002 (2026-10-20)
status: confirmed
---
# D-009 In-app announcements + push/e-mail + "share to group"; no Messenger/WhatsApp integration
**Decision:** the app is the source of truth for attendance, changes, substitutions and payments; in-app notifications + e-mail; a button that generates text with a link to paste into the group chat; magic link for declarations; in-app chat only where a record is needed.
**Confirmation (2026-10-20, Q-002, DD-15):** push is dropped from 1.0 — the module facts have no web push for a PWA; push returns together with a native app. In 1.0 the channels are in-app notifications and e-mail (REQ-009).
**Why:** no official API for Messenger/WhatsApp groups; WhatsApp Business 1:1 is paid and template-based.
**To change:** a group API becoming available, or interview results showing that parents will not click the link (H6).
**Revisit:** after testing the magic link in one Gwiazda group.
