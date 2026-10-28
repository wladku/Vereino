// ACL features of `club_core` (club spec *Users, Permissions, and Scope*); `*.manage` implies `*.view`.
// Phase A1 declares only the features its routes use; #25 (E02-S01) adds the remaining club_core features.
export const features = [
  { id: 'club_core.view', title: 'View club settings and structure', module: 'club_core' },
  {
    id: 'club_core.manage',
    title: 'Manage club settings and structure',
    module: 'club_core',
    dependsOn: ['club_core.view'],
  },
]

export default features
