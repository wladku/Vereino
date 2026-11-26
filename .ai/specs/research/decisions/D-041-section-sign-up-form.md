---
number: D-041
date: 2026-11-25
owner: Władek Kuć
source: the owner's request of 2026-11-25 in a Claude Code session ("Chciałbym dodać możliwość zgłoszenia się do sekcji… umożliwi walidację, przykładowo wieku") and his four answers to Claude's questions the same day, after a clickable mockup of the form and the coordinator's screens ("Tak, zapisz i załóż")
status: confirmed (direction) / open (data model, migrations and the legal text, settled in the E26 spec)
supersedes: Q-L06 of the people life-cycle spec ("No self-enrolment in 1.0"), and CM Q-027 as far as it keeps people who are not members out of 1.0
---
# D-041 A sign-up form for a section: the coordinator decides, age is checked, groups have places and a waiting list, and a trial session can come first

Until now nobody could join a club through Vereino. The coordinator enrolled every child by hand (Q-L06, 2026-11-16), and people who are not members stayed outside 1.0 (CM Q-027). The owner wants parents to apply to a section from the club's public page.

## Decision

1. **A public sign-up form per section, without an account.**
   - The section page gets a "Zgłoś dziecko" button when the section accepts online applications.
   - A parent or guardian applies for a child. An adult (18 or older) may apply for themselves.
   - The applicant confirms the e-mail address with a one-time link valid for one hour, the same pattern as facility booking requests (REQ-024). An unconfirmed application never reaches the club.
2. **The section coordinator decides.**
   - Applications reach the coordinator of the section, or the club administrator when the section has none.
   - The coordinator has four decisions:
     - **accept** into a group from a chosen day;
     - **propose a trial session**;
     - **put on the waiting list**;
     - **reject** with a reason the applicant sees.
   - Accepting creates or reuses the child and guardian persons and the family relation, adds the group membership and sends the account invitation. When the applicant may already be in the club, the coordinator sees a possible duplicate and can reuse that person.
   - Every decision e-mails the applicant. The applicant has a link to see the state and to withdraw.
3. **Age is checked with a hint and a warning, never a hard block.**
   - Age is counted in full years on the club's age reference day, by default 1 September of the current season, not on the day of the application.
   - After the birth date, the form shows the matching groups of the section first (the group's public age range, `age_from`–`age_to`).
   - A group outside the age range can still be chosen from "all groups", with a warning. The coordinator sees "outside the age range". "Choose a group for us" is always possible.
   - Hard limits: a birth date in the future is refused; a child is 3–17 and an adult 18 or older on the reference day.
4. **Places and a waiting list.**
   - A group gets an optional limit of places and its own "accepts applications" switch.
   - An application to a full group goes on that group's waiting list, numbered in order of applications. When a place frees up, the coordinator is told who is first.
   - The coordinator may accept beyond the limit after a warning.
5. **A trial session on request.**
   - The applicant can ask for a trial session first (on by default in the form).
   - The coordinator proposes one of the group's next sessions. The child appears on that session's attendance list as a trial participant, with no membership and no fee. After the session the coordinator accepts or rejects.
6. **Data minimisation and privacy.**
   - The form asks only for:
     - the child's or adult's name and birth date;
     - the guardian's name, e-mail and phone;
     - the guardian's statement;
     - the wish for a trial session, experience and a note of up to 500 characters;
     - acceptance of the club rules, and acknowledgement of the information on data processing.
   - No address, PESEL, school or health data. The note warns against health information (GDPR Art. 9).
   - The assumed legal basis is steps before a contract at the applicant's request (Art. 6(1)(b)). The lawyer confirms it with the information text.
   - Retention:
     - unconfirmed applications are deleted after 24 hours;
     - rejected, withdrawn and expired ones are anonymised after 30 days;
     - waiting lists are cleared at the end of the season.
   - Spam protection without a CAPTCHA: a honeypot field, a rate limit per e-mail address and IP, and the confirmation link.
7. **Core, not Enterprise** (D-035), and phone first for the coordinator (D-029).

## Why

- Clubs collect sign-ups today by phone, Messenger and paper forms. The benchmark (2026-10-23) lists online enrolment as a common feature of competitors, and the four interested clubs (D-034) recruit every season.
- The coordinator keeps control over who joins and where. Checking age against the groups at the start removes most back-and-forth with parents.
- A waiting list and a trial session are how clubs already work. Without them, coordinators would keep the real process on paper.

## Not decided here (for the E26 spec)

| Item | Note |
|---|---|
| Data model and owning module | where applications live (`groups` or a new module), the lifecycle of trial participants on an attendance list, duplicate detection rules |
| Migrations | applications table; `groups_groups` limit and "accepts applications"; section "accepts online applications"; club settings (age reference day, answer time, information text). Each is Ask First. |
| Answer time | proposal: 7 days, a club setting; the administrator's dashboard shows applications past it |
| Age by birth year for teams | a team whose age category has a "U" range should match by birth year, reusing REQ-L16's rule of the bulk move's "Fits" filter (#601); other groups match by age on the reference day |
| Legal text | the information on processing for applicants, checked by the lawyer with the D-035 items |
| Fees after acceptance | which fee schedule applies from the start day, and a part month |

## Applied in

- The product brief: row D41.
- Q-L06 of `.ai/specs/implemented/2026-11-14-vereino-people-life-cycle-and-data-entry.md` is marked superseded.
- Epic E26 and its spec story.
- Mockup: a clickable design shown to the owner on 2026-11-25. Its screens and rules are summarised in the epic.

**To change:** a superseding record approved by the owner.

**Revisit:** after the first season of sign-ups with a pilot club.
