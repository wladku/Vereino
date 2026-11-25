// ACL features of `training` (training outlines spec *Users, Permissions, and Scope*, *API, Command, and Error
// Contracts*; E24-S03, #683). `dependsOn` is reported by the platform's ACL editor only. The scope comes from the
// grants: a coach writes their own outlines and those of their groups' sessions, a coordinator those of their sections,
// the club administrator every outline of the club (`@vereino/core` `roleCatalogue`: `training.*`). Phase 4 (E24-S05,
// #685) adds the shared library: browsing, copying, rating and reporting (`training.library.use`) and publishing the
// outlines the caller may edit, up to the club's widest level (`training.library.publish`).
export const features = [
  {
    id: 'training.outlines.write',
    title: 'Write training outlines and attach them to sessions and recurring activities',
    module: 'training',
  },
  {
    id: 'training.manage',
    title: 'Manage every training outline of the club',
    module: 'training',
    dependsOn: ['training.outlines.write'],
  },
  {
    id: 'training.library.use',
    title: 'Browse, copy, rate and report outlines in the shared library',
    module: 'training',
    dependsOn: ['training.outlines.write'],
  },
  {
    id: 'training.library.publish',
    title: 'Share training outlines in the library, up to the club level',
    module: 'training',
    dependsOn: ['training.library.use'],
  },
]

export default features
