// ACL features of `foundation` (social sign-in spec *Users, Permissions, and Scope*; #566): an account holder lists,
// connects and disconnects their own sign-in identities (seeded wherever `people.self` is, so it follows the member
// role); the club administrator lists and unlinks any person's identities.
export const features = [
  { id: 'foundation.identity.self', title: 'Manage own social sign-in identities', module: 'foundation' },
  { id: 'foundation.identity.manage', title: "Manage people's social sign-in identities", module: 'foundation' },
]

export default features
