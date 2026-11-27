# Run: #868 personal invitation link and QR code (phases 1–2)

- **Goal / trigger**: Cezar run of `om-auto-fix-issue` for #868 (E29-S01, epic #865), queued by the `cezar` label after the owner answered Q-IL01…Q-IL05 on 2026-11-26 (#868 comment 7203995227).
- **Spec**: `.ai/specs/2026-11-26-vereino-invitation-link-and-qr.md` (design PR #875). **Branch**: `feat/issue-868-guardian-invite-links`. Worktree: `.ai/cezar/worktrees/150584ea-…`.

## Steps

1. Claimed #868 (assignee kept, `in-progress`, 🤖 claim comment naming this run).
2. Spec PR #875: wrote the owner's answers into the Open Questions table, status `Ready for implementation`, changelog file; pushed to its branch and took it out of draft. Merged that branch into this one so the spec travels with the code.
3. `@vereino/ui`: `qrcode` (approved Q-IL01) + `@types/qrcode`; `QrCode` (SVG, quiet zone, white background), `qr-code-model.ts`, stateless `InvitationSharePanel`; More → Invitations (`CLUB_INVITATIONS_HREF`, feature `people.invitations.share`). 100 % coverage.
4. `people`: entity `InvitationLink` + migration `Migration20261126215230_people` (one table, reviewed; never applied to a real database); `lib/invitation-links.ts` (share reach, acting role, list reads, link validity; 100 % covered); `services/invitation-links.ts` (issue + revoke older, inspect, start, pending families); command `people.persons.share_invitation`; routes `POST …/account/invitation-link`, `GET /api/people/invitations/pending`, `POST /api/people/invitations/{token}/start`; error `invitation_link_invalid` (410); feature `people.invitations.share` for coach and coordinator (`packages/core/src/roles.ts`); dead links purged by the nightly import purge; table in the club tables list.
5. `groups`: `participantGroups` added to the people-owned `MembershipContribution` DI contract; "Invite families" link on `/club/groups/[id]`.
6. `foundation`: `passwordSetupLink` returns the platform password-setup URL instead of mailing it.
7. UI: Account tab **Invitation link**, `InvitationShareDialog`, `/club/invitations`, `/club/i/[token]` (server-rendered, club only), catalogs en/pl in seven frame modules.
8. `AGENTS.md`: the approved system-scope exception for `people_invitation_links.token_hash`.
9. Isolation probes, TEST-IL01…IL05, E09-S04 updated; lesson `member-more-entry-needs-every-frame-catalog`.

## Decisions

- `start` answers 200 `{ url }` and the page navigates (keeps starting/error states) instead of a 303.
- No revoke hook on departure/anonymization: validity is checked live (person gone, account no longer invited).
- Purge folded into `people:purge-import-rows` (no new job type to roll out to existing clubs).
- Page shows the club name only (logo URL needs a session); renders in the request language.
- Recorded in `.ai/specs/changelog/2026-11-26-vereino-invitation-link-and-qr/2026-11-26-issue-868-phase-1-2.md`.

## Results

- `yarn verify`: green (see PR body for the final run).
- Integration: TEST-IL01, TEST-IL02, TEST-IL03, TEST-IL04, TEST-IL05, E09-S04 each passed locally (`yarn test:integration:vereino --filter <ID>`).
- Failures on the way: lint `react-hooks/refs` and `react-hooks/set-state-in-effect` in the share dialog (rewritten on `useQuery` + `useEffectEvent`); TEST-IL01 read the audit log with the admin token `signInBrowser` had ended; TEST-IL02 read staff actions through the admin's audit view, which lists only the admin's own actions — now counts `action_logs` by actor and resource in SQL.

## Open / next

- Phase 3 (activation with Google, Q-IL03) waits for a separate owner decision.
- QR scanned from a real phone and dark-mode check by a human (exit gate of phase 1) not done by this run.
