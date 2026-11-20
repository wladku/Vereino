// What `facilities` erases when the club anonymises a former person (people life-cycle spec *Events* row
// `people.person.anonymized`, REQ-L05; #308): the contact snapshots of the person's rentals (`contact_name`,
// `contact_phone`, `contact_email`, `contact_locale`) are cleared and the renter's display name becomes what the person
// directory shows for them ("Former member"). Ids, slots, amounts and the charge stay. Idempotent: a second run finds
// nothing left to clear and writes the same values.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { Rental } from '../data/entities'
import { personNames, type FacilitiesScope } from './directory'

/** Clears the person's rental contact snapshots; returns how many rentals were touched. */
export async function clearRenterContacts(
  container: AwilixContainer,
  scope: FacilitiesScope,
  personId: string,
): Promise<number> {
  const em = container.resolve<EntityManager>('em').fork()
  const rentals = await em.find(Rental, { ...scope, renterType: 'person', renterId: personId })
  if (rentals.length === 0) return 0
  const shown = (await personNames(container, scope, [personId], em)).get(personId)
  for (const rental of rentals) {
    rental.contactName = null
    rental.contactPhone = null
    rental.contactEmail = null
    rental.contactLocale = null
    if (shown) rental.renterDisplayName = shown
  }
  await em.flush()
  return rentals.length
}
