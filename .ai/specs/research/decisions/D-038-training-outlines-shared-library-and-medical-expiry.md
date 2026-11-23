---
number: D-038
date: 2026-11-23
owner: Władek Kuć
source: the owner's conversations with coaches of two clubs holding a PZPN academy certificate (names in the owner's notes); the owner's answers of 2026-11-23 in a Claude Code session, after Claude read the PZPN Certification Programme documents and the medical-certificate rules; recorded with epic E24
status: confirmed
---
# D-038 Training outlines on sessions, a shared outline library, and the medical certificate expiry date

N01 keeps coaching tools out of 1.0: training diagrams, an exercise library, a medical module, scouting, assessments and statistics. D16 kept it after one coordinator wished for training plans for a possible PZPN bronze star. Its trigger was "the club commits to the certification and coaches confirm the need". In November 2026 the owner met coaches of two clubs that already hold a PZPN star:

- **Club A:** a coach needs to know until when each player's medical certificate is valid. He called it very important.
- **Club B:** a coach needs training outlines ("konspekty") with exercises. A certified academy must train by the PZPN training programme. When he heard Vereino is open source for every club, he proposed a space where coaches share their outlines. The owner added ratings and a ranking, so that a coach who has 10 outlines and needs 100 can use and improve other coaches' outlines.

## What the research found

**The PZPN Certification Programme for football schools** has bronze, silver and gold levels. The guidance for the current cycle is called "Certyfikacja Elite" (October 2025). Sources: the programme rules, cycle III; Załącznik 4, "Zakres Wizyty Monitorującej"; "Wskazówki do bieżącego spełniania Kryteriów Programu w systemie na poziomie Srebrnym" (October 2025); and the 2025 grant settlement rules for the three levels.

- **A training outline** ("konspekt treningowy") sets the goal and the course of one session. It is divided into a warm-up, a main part and a cool-down. It must agree with the monthly training plan ("plan treningowy", a mesocycle of four weekly microcycles). The template in the "Program Szkolenia PZPN dla kategorii wiekowych od U6 do U13" is the minimum content. A school may instead use its own programme that meets PZPN's guidelines.
- **PZPN's own system.** Certified schools keep their data in PZPN's "System Zarządzania Szkółką Piłkarską":
  - teams;
  - the session schedule;
  - an outline as a PDF on each training event;
  - attendance, which locks 72 hours after the session ends;
  - coach and facility contracts;
  - each player's medical examination with valid-from and valid-to dates and a scan.

  The system marks a player's medical examination red (missing or expired), orange (under a month left) or green.
- **The monitoring visit** checks that outlines were entered on time and match the session the monitor watches, the equipment used and the plan. It also checks the attendance lists of the last five sessions and the schedule in PZPN's system.
- **Funding.** Certified schools receive grants, for example coach pay of up to 80 zł per hour of training. Only sessions entered in PZPN's system can be claimed.
- **No public interface.** No public API to PZPN's system was found.

**Medical certificates.** Sources: art. 37 of the Sports Act, and the Minister of Health regulation of 22 July 2016 (consolidated text Dz. U. 2020 poz. 812).

- **Who needs one.** A player in a competition organised by a Polish sports association must hold a certificate that allows safe participation. The duty is on the player. No club duty to check certificates was found.
- **Exams.** Periodic exams are due every 12 months, and before the certificate expires. Some tests are due every 6 months up to age 16.
- **Expiry.** The doctor sets the expiry date.
- **Cost.** It is publicly funded for unpaid players under 23.
- **Not verified:** whether PZPN's competition rules add a duty for clubs.

## Decision

1. **Medical certificate: only the expiry date.**
   - A person gets one field, "valid until" for the sports medical certificate. There is no scan, no result and no diagnosis.
   - Coaches and coordinators see a status on the roster and the attendance list: valid, ending within a month, or expired or missing.
   - The guardian, or the adult participant, is reminded a month before expiry and on the day it expires.
   - The date is health data (GDPR Art. 9). The spec states the legal basis and updates the records of processing and the DPIA (E19).
2. **An outline on a session.**
   - A coach writes an outline with at least the PZPN template's content: goal, age category, the three parts, exercises with their time, and equipment.
   - The coach attaches it to a session or to a recurring activity.
   - The outline prints to a PDF in the PZPN layout, ready to upload to PZPN's system.
3. **Less double entry through export, not integration.**
   - Outlines export as PDF; attendance and the schedule export as files.
   - The coach uploads them to PZPN's system or copies them in.
   - There is no integration with PZPN's system now. D23's PZPN integration (Should) is unchanged.
4. **A shared outline library with three visibility levels:**
   - the club only;
   - clubs on Vereino;
   - public, for anyone.

   A club setting chooses the widest level its coaches may use. A new club starts with "clubs on Vereino". A club can close it to its own coaches or open it to the public.
5. **Ratings and a ranking.**
   - A coach rates an outline from 1 to 5 after running a session with it.
   - The ranking combines the average rating with the number of coaches who attached the outline to a session.
   - A coach can copy an outline and improve it. The copy keeps the original author's credit.
6. **Core, not Enterprise.** Small certified academies need this (D-035).
7. **N01 is narrowed.** Training outlines, the outline library and the medical expiry date come into scope. Drawing tools, scouting, assessments, individual statistics and medical results stay out. This supersedes D16 for N01; D16 stays for grants (N07).

**Why:**

- Two certified clubs asked for these on their own. Their coaches confirmed the need, which is D16's trigger.
- The certificate makes outlines and valid medical examinations a duty, not a convenience.
- Keeping only an expiry date gives the coach what he asked for with the least health data.
- A shared library grows with every club on the shared instance (D-034) and fits an open project.
- PZPN's system has no public interface, so export is the honest way to cut double entry today.

## Not decided here

| Topic | Where it is settled |
|---|---|
| Whether a coach chooses visibility per outline within the club's level | the E24 spec, as an open question for the owner |
| The licence of public outlines (CC BY-SA proposed) and the terms coaches accept when sharing | the E24 spec, with the lawyer items of D-035 |
| Moderation of public outlines and reporting abuse | the E24 spec |
| Images or drawings inside an outline (uploads only, no editor) | the E24 spec |
| Monthly training plans (mesocycles) linked to outlines | later, after the outline library is used |
| Asking PZPN for an interface to its system | later; D23 stands |

**Applied in:**

- product brief: N01 narrowed, D16 narrowed, and the D38 row;
- epic E24.

**To change:** a superseding record approved by the owner.
