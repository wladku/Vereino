// Trusted public keys of Vereino Enterprise licence keys, by `kid` (enterprise package spec DD-E04; #649). Server-only:
// `lib/licence-verify.ts` reads it. Each value is an Ed25519 public key in SPKI PEM. The private halves never enter any
// repository, CI or server: the owner signs keys offline.
//
// Empty until the owner creates the first production signing pair (spec phase 2): until then every installed key is
// rejected as `unknown_kid` and every Enterprise feature is `off`. Rotation: a new `kid` is added here in a release
// before keys signed with it are issued; an old `kid` stays until its last key expires. A `test-` kid never belongs
// here (`trustedLicenceKeys` refuses to start with one).
export const LICENCE_PUBLIC_KEYS: Readonly<Record<string, string>> = {}

/** Every kid of the committed test key pair starts with this; such a kid is trusted only in CI (DD-E11). */
export const TEST_LICENCE_KID_PREFIX = 'test-'
