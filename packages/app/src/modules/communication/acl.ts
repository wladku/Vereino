// ACL features of `communication` (club spec *Users, Permissions, and Scope* → full feature list; foundation III adds
// none). The role catalogue (`@vereino/core` `roleCatalogue`) grants `communication.view` to every member,
// `communication.post` to coaches and coordinators and `communication.*` to the club administrator;
// `communication.cases.manage` is used by the cases of phase C (#36) and by the staff edit of someone else's message.
export const features = [
  { id: 'communication.view', title: 'Read and reply to own threads', module: 'communication' },
  {
    id: 'communication.post',
    title: 'Post announcements to the scopes of own grants',
    module: 'communication',
    dependsOn: ['communication.view'],
  },
  {
    id: 'communication.cases.manage',
    title: 'Manage cases and messages in own sections',
    module: 'communication',
    dependsOn: ['communication.view'],
  },
]

export default features
