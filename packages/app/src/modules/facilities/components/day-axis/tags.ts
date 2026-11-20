// The `Tag` variants of the entry kinds and the zones (facilities parity spec DD-R01): the axis blocks, the zone bands,
// the legend swatches, "Wpisy dnia" and the entry details all take their semantic status tokens from here. The colours
// follow the mockup's day axis (`docs/ux-concept/mockups/styles.css`, `.blk-*` and `.z-*`; #495): sessions green, club
// bookings indigo, rentals amber, closures and maintenance grey (told apart by their double and dotted border); requests
// stay grey and dashed (the mockup's `.blk-pend` is a card with a dashed amber edge; #495 left requests as they were);
// the public zone indigo (the mockup's blue), club training green, the paid zone amber, a closed zone grey. `AxisTone`
// leaves out the colour-named `pink` and `brand` variants, so a map that names them fails the typecheck.
import type { Zone } from '../../lib/zones'
import type { CalendarEntryKind } from '../club-places/places-client'

/** The semantic `Tag` variants the day axis may use. */
export type AxisTone = 'success' | 'warning' | 'error' | 'info' | 'neutral'

export const KIND_TAGS: Record<CalendarEntryKind, AxisTone> = {
  session: 'success',
  booking: 'info',
  rental: 'warning',
  request: 'neutral',
  closure: 'neutral',
  maintenance: 'neutral',
}

export const ZONE_TAGS: Record<Zone, AxisTone> = {
  public_free: 'info',
  club_training: 'success',
  reservable_paid: 'warning',
  closed: 'neutral',
}
