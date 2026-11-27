// ACL features of `enrolment` (sign-up form spec *Users, Permissions, and Scope*; #799). The scope comes from the
// grants (BR-J5): a coordinator sees and decides the applications of their sections, the club administrator those of
// every section. `enrolment.trials.mark` is for the coaches of a trial session (phase 4). Seeded on the `vereino_*`
// roles by the role catalogue (`@vereino/core` `roleCatalogue`).
export const features = [
  { id: 'enrolment.applications.view', title: 'See applications to the sections you coordinate', module: 'enrolment' },
  {
    id: 'enrolment.applications.decide',
    title: 'Decide applications to the sections you coordinate',
    module: 'enrolment',
    dependsOn: ['enrolment.applications.view'],
  },
  { id: 'enrolment.trials.mark', title: 'Mark trial participants of your sessions', module: 'enrolment' },
  {
    id: 'enrolment.manage',
    title: 'See and decide every application of the club',
    module: 'enrolment',
    dependsOn: ['enrolment.applications.view', 'enrolment.applications.decide'],
  },
]

export default features
