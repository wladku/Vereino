// The `Tag` variants of the entry kinds and the zones (facilities parity spec DD-R01): the axis blocks, the zone bands,
// the legend swatches, "Wpisy dnia" and the entry details all take their semantic status tokens from here. The colours
// follow the mockup's day axis (`docs/ux-concept/mockups/styles.css`, `.blk-*` and `.z-*`; #495): sessions green, club
// bookings indigo, rentals amber, requests, closures and maintenance grey (told apart by their border: dashed, double,
// dotted); the public zone indigo (the mockup's blue), club training green, the paid zone amber, a closed zone grey.
import type { TagMap } from '@open-mercato/ui/primitives/tag'
import type { Zone } from '../../lib/zones'
import type { CalendarEntryKind } from '../club-places/places-client'

export const KIND_TAGS: TagMap<CalendarEntryKind> = {
  session: 'success',
  booking: 'info',
  rental: 'warning',
  request: 'neutral',
  closure: 'neutral',
  maintenance: 'neutral',
}

export const ZONE_TAGS: TagMap<Zone> = {
  public_free: 'info',
  club_training: 'success',
  reservable_paid: 'warning',
  closed: 'neutral',
}
