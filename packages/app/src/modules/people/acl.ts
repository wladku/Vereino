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
]

export default features
