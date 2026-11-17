// The `Tag` variants of the entry kinds and the zones (facilities parity spec DD-R01): the axis blocks, the zone bands,
// the legend swatches, "Wpisy dnia" and the entry details all take their semantic status tokens from here.
import type { TagMap } from '@open-mercato/ui/primitives/tag'
import type { Zone } from '../../lib/zones'
import type { CalendarEntryKind } from '../club-places/places-client'

export const KIND_TAGS: TagMap<CalendarEntryKind> = {
  session: 'info',
  booking: 'success',
  rental: 'warning',
  request: 'neutral',
  closure: 'error',
  maintenance: 'pink',
}

export const ZONE_TAGS: TagMap<Zone> = {
  public_free: 'success',
  club_training: 'info',
  reservable_paid: 'warning',
  closed: 'error',
}
