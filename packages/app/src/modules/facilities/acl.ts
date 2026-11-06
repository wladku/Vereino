// ACL features of `facilities` (facilities spec *API, Command, and Error Contracts*; #121). `dependsOn` is reported by
// the platform's ACL editor only; it is not expanded at check time, so a role that manages also needs
// `facilities.view` (`@vereino/core` `roleCatalogue`: the club administrator holds `facilities.*`). The rental,
// booking, log and maintenance features arrive with their stories.
export const features = [
  {
    id: 'facilities.view',
    title: 'View facilities: zones, closures, rates and the facility calendar',
    module: 'facilities',
  },
  {
    id: 'facilities.manage',
    title: 'Manage facility rules: zones, closures, rates and booking availability',
    module: 'facilities',
    dependsOn: ['facilities.view'],
  },
]

export default features
