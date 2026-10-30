// ACL features of `club_core` (club spec *Users, Permissions, and Scope*); `*.manage` implies `*.view` in the role
// catalogue (the platform does not expand `dependsOn`). #29 adds the publication settings and the section's public
// content (with its logo and materials), which the coordinator holds for their own sections.
export const features = [
  { id: 'club_core.view', title: 'View club settings and structure', module: 'club_core' },
  {
    id: 'club_core.manage',
    title: 'Manage club settings and structure',
    module: 'club_core',
    dependsOn: ['club_core.view'],
  },
  {
    id: 'club_core.publication.manage',
    title: 'Manage the publication of the club page',
    module: 'club_core',
    dependsOn: ['club_core.manage'],
  },
  {
    id: 'club_core.sections.public_content',
    title: "Edit a section's public page content, logo and materials",
    module: 'club_core',
    dependsOn: ['club_core.view'],
  },
]

export default features
