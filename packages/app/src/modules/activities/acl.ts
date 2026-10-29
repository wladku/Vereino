// ACL features of `activities` used by club spec phase 2 steps 3 and 8 (*Users, Permissions, and Scope* → full feature
// list); the attendance, declaration and report features arrive with their stories. `dependsOn` is reported by the
// platform's ACL editor only; it is not expanded at check time, so the role catalogue grants `activities.view` next to
// `activities.manage` (`@vereino/core` `roleCatalogue`).
export const features = [
  { id: 'activities.view', title: 'View activities and sessions', module: 'activities' },
  {
    id: 'activities.manage',
    title: 'Plan activities and move sessions',
    module: 'activities',
    dependsOn: ['activities.view'],
  },
  { id: 'activities.coach', title: 'Lead and cancel the sessions of own groups', module: 'activities' },
  { id: 'activities.events.create', title: 'Create one-off events for own groups', module: 'activities' },
]

export default features
