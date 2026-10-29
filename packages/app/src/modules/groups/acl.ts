// ACL features of `groups` (club spec *Users, Permissions, and Scope* → full feature list). `dependsOn` is reported by
// the platform's ACL editor only; it is not expanded at check time, so the role catalogue grants `groups.view` next
// to `groups.manage` (`@vereino/core` `roleCatalogue`).
export const features = [
  { id: 'groups.view', title: 'View groups, rosters, seasons and external teams', module: 'groups' },
  {
    id: 'groups.manage',
    title: 'Manage groups, memberships, seasons and external teams',
    module: 'groups',
    dependsOn: ['groups.view'],
  },
]

export default features
