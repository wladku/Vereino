// When a picture of a club event is public (event photos spec BR-I01, DD-I01, REQ-I04, REQ-I05; #872): decided on every
// read from the consents in force now, never stored. A picture is public when (a) the club event is public — the club
// publishes its page and the `events` block, the event is public and has a live part — (b) a manager published the
// picture and confirmed who is on it, and (c) it is a graphic, or every person marked on it has `imagePublishable` now
// (BR-I02, BR-I03 of `people`). The same rule gives staff the picture's state and the marked people without consent.
// Pure: no database, no framework.
import type { ClubEventPictureKind } from './club-event-files'

/** What the rule reads of a picture. */
export type PictureFacts = {
  kind: ClubEventPictureKind
  publishedAt: Date | string | null
  peopleConfirmedAt: Date | string | null
  /** The persons marked on the picture (always empty for a graphic). */
  personIds: readonly string[]
}

/**
 * The state staff see (REQ-I04): `draft` (not published), `unconfirmed` (published, but the people are not confirmed —
 * a mark change clears the confirmation), `waiting_for_consent` (published and confirmed, held back by a missing
 * consent), `event_not_public` (the event or the club page is not public) or `public`.
 */
export type PictureState = 'draft' | 'unconfirmed' | 'waiting_for_consent' | 'event_not_public' | 'public'

/** Whether the people of a picture are confirmed: a confirmation, and at least one mark on a photo. */
export function peopleConfirmed(picture: PictureFacts): boolean {
  if (!picture.peopleConfirmedAt) return false
  return picture.kind === 'graphic' || picture.personIds.length > 0
}

/**
 * The persons marked on the picture whose image may not be published now, in mark order; none for a graphic. A person
 * absent from `publishable` (unknown, deleted, another club) counts as without consent (fail closed).
 */
export function missingConsentIds(picture: PictureFacts, publishable: ReadonlyMap<string, boolean>): string[] {
  if (picture.kind === 'graphic') return []
  return picture.personIds.filter((id) => publishable.get(id) !== true)
}

/** The state of a picture for staff (REQ-I04) under BR-I01. */
export function pictureState(
  picture: PictureFacts,
  publishable: ReadonlyMap<string, boolean>,
  eventPublic: boolean,
): PictureState {
  if (!picture.publishedAt) return 'draft'
  if (!peopleConfirmed(picture)) return 'unconfirmed'
  if (missingConsentIds(picture, publishable).length > 0) return 'waiting_for_consent'
  return eventPublic ? 'public' : 'event_not_public'
}

/** BR-I01: whether a guest may see the picture now. */
export function isPublicPicture(
  picture: PictureFacts,
  publishable: ReadonlyMap<string, boolean>,
  eventPublic: boolean,
): boolean {
  return pictureState(picture, publishable, eventPublic) === 'public'
}

/**
 * How many of `pictures` a withdrawal of `personId`'s consent holds back now (REQ-I09): published, confirmed pictures
 * that mark the person and fail BR-I01 because of a missing consent.
 */
export function heldBackCount(
  pictures: readonly PictureFacts[],
  personId: string,
  publishable: ReadonlyMap<string, boolean>,
): number {
  return pictures.filter(
    (picture) =>
      picture.personIds.includes(personId) && pictureState(picture, publishable, true) === 'waiting_for_consent',
  ).length
}
