// ACL features of `foundation` (social sign-in spec *Users, Permissions, and Scope*; #566): an account holder lists,
// connects and disconnects their own sign-in identities (seeded wherever `people.self` is, so it follows the member
// role); the club administrator lists and unlinks any person's identities.
export const features = [
  { id: 'foundation.identity.self', title: 'Manage own social sign-in identities', module: 'foundation' },
  { id: 'foundation.identity.manage', title: "Manage people's social sign-in identities", module: 'foundation' },
  // Staff second factor (`.ai/specs/implemented/2026-11-26-vereino-staff-second-factor.md`, DD-2F02, DD-2F07; #736): the holder
  // signs in with Google or with a password and an e-mail code; the reset removes another person's identity links and
  // ends their sessions after the administrator verified them.
  { id: 'foundation.second_factor.required', title: 'Sign in with a second factor', module: 'foundation' },
  { id: 'foundation.second_factor.reset', title: "Reset a person's second factor", module: 'foundation' },
]

export default features
