// ACL features of `people` (club spec *Users, Permissions, and Scope* → full feature list); `dependsOn` makes every
// feature beyond `people.self` imply `people.view` (Odoo `implied_ids`, foundation spec P-04).
export const features = [
  { id: 'people.self', title: 'View and edit own person record', module: 'people' },
  { id: 'people.view', title: 'View people records', module: 'people' },
  { id: 'people.manage', title: 'Manage people records', module: 'people', dependsOn: ['people.view'] },
  { id: 'people.roles.manage', title: 'Manage staff role assignments', module: 'people', dependsOn: ['people.view'] },
  { id: 'people.pesel.view', title: 'View PESEL numbers', module: 'people', dependsOn: ['people.view'] },
  { id: 'people.accounts.manage', title: 'Create accounts for people', module: 'people', dependsOn: ['people.view'] },
  // People life-cycle spec REQ-L05, DD-L06 (#308): the irreversible erasure has its own feature, so a later role can
  // hold `people.manage` without it; the club administrator holds it through `people.*`.
  {
    id: 'people.persons.anonymize',
    title: 'Anonymise former people',
    module: 'people',
    dependsOn: ['people.manage'],
  },
  // Person data export spec DD-X01, A-6 (#527): one person's data for an access or portability request; the club
  // administrator holds it through `people.*`, the route also requires the `club_admin` grant.
  {
    id: 'people.persons.export',
    title: "Export a person's data",
    module: 'people',
    dependsOn: ['people.view'],
  },
  // Training outlines and medical expiry spec REQ-O01, REQ-O02, Q-O01 (#682): the medical certificate status and date
  // of persons in the reader's scope (coach: own groups; coordinator: own sections), and setting the date as staff
  // (coordinator for own sections, the club administrator through `people.*`). Neither feature lets staff give the
  // `medical` consent: only the person or a guardian does (BR-O1).
  { id: 'people.medical.view', title: 'View medical certificate status', module: 'people' },
  {
    id: 'people.medical.manage',
    title: 'Set medical certificate dates',
    module: 'people',
    dependsOn: ['people.medical.view'],
  },
  // Personal invitation link spec REQ-IL01, REQ-IL02, Q-IL05 (approved 2026-11-26; #868): take a guardian's personal
  // invitation link. The record scope narrows it: the administrator any person, a coach the families of the own groups,
  // a coordinator those of the own sections. No `dependsOn`: a coach holds no `people.view`.
  { id: 'people.invitations.share', title: 'Share personal invitation links', module: 'people' },
]

export default features
