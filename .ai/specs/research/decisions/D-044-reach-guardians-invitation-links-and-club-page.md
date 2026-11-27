---
number: D-044
date: 2026-11-26
owner: Władek Kuć
source: om-discover refresh session with Claude Code, 2026-11-26; the owner chose the directions in chat after the first club presentation (meeting note kept outside the public repository)
status: confirmed
---
# D-044 Next scope: reach guardians through invitation links and QR codes; the club page gets only event photos and graphics

## Context

- On 2026-11-26 the owner showed Vereino to a coach of a single-section youth football club (about 60 children).
  It was the first account from outside the team since October. The coach said:
  - the club talks to parents only in WhatsApp groups, and kit orders also go through a group;
  - the club has to chase parents by phone for attendance and fees, and he expects parents will not use an app;
  - the club has a Facebook page only and plans a website;
  - he asked whether the club page could replace Facebook and show event descriptions, and whether each club gets
    its own page.

  He liked contact with parents "in one app", and the parent seeing what is on, when, and what is missing.
  The owner's meeting note draws two conclusions. First, contact with parents hurts more than fees. Second, the board
  decides, and the club itself must bring in a rule that parents answer only through the app. D44 addresses getting
  started, not that rule. Staff can already paste a text with a link into the group chat (D09).
- Today the club administrator creates a person and Vereino sends the invitation by e-mail (D27: sign-in only for
  invited account holders). E-mail may go unread (A07). The public club page is built from club data with no editor
  (N06). It shows the club, its sections and facilities. Public one-off events have their own page (P-06) with a
  description, a place and images. Announcements are internal threads and never public. The section sign-up form
  exists (D41).
- Options weighed for the invitation path:
  - **(A)** a personal invitation as a link or QR code. Staff copy it and send it on WhatsApp, or show it at
    training. Who creates accounts does not change. A group QR code leads new children to the sign-up form (D41).
  - **(B)** an open group link: the parent registers and claims a child, and the coordinator approves the link.

  (B) is faster for the club, but it adds a new path to create accounts and a risk that a stranger attaches to
  someone else's child.

## Decision

1. **Invitation path (A).**
   - Staff (coach, coordinator, administrator) can copy a personal invitation link for a family and show it as a QR
     code. The link opens the existing account activation, including sign-in with Google, and with Facebook once it is live (D27; Facebook needs Meta's App Review).
   - A group QR code leads to the section's sign-up form (D41).
   - No self-registration and no claiming of children (option B rejected).
2. **The club page stays a simple club card.**
   - It is built from club data, and it is not meant to replace a website builder or a content management system
     (N06 stays).
   - The only addition is several photos and graphics on a club event, shown on the public event page (P-06) next
     to the existing poster.
   - There are no news, no front-page blocks and no page editor. Showing announcements on the page as news was
     proposed and rejected by the owner.
3. **Photos of children on events need the guardian's image consent** (Q19, answered by the owner on 2026-11-26). The owner was given three options:
   - the club confirms it holds the image consents when it publishes;
   - Vereino collects each child's image consent from the guardian and blocks publishing without it;
   - for now, only photos without identifiable people.

   The owner chose the second option: Vereino records each child's image consent from the guardian, and a photo
   showing a child is not published without it. The consent text goes to the lawyer with the D-035 lawyer items
   before real club data. The design (marking who is in a photo, withdrawing consent) needs a spec. It is a legal question, so the lawyer items of D-035 apply.
4. **The attendance report for municipal grants stays a hypothesis** (A11). It is not in scope, and N07 is unchanged.

## Consequences and review

- New backlog stories:
  - the invitation link and QR code;
  - the group QR code;
  - a spec, then the build: photos and graphics on club events, with the guardian's image consent.
- The guardians' adoption risk (A01, A07) stays untested. These changes lower the effort to start, but they do not
  show that parents will use Vereino. The coach's expectation that they will not is the strongest account so far.
- Revisit after the next club conversations (a second meeting is on 2026-11-27, others postponed) or after the first
  pilot month.
