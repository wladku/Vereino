// ACL features of `facilities` (facilities spec *API, Command, and Error Contracts*; #121). `dependsOn` is reported by
// the platform's ACL editor only; it is not expanded at check time, so a role that manages also needs
// `facilities.view` (`@vereino/core` `roleCatalogue`: the club administrator holds `facilities.*`). Rentals and entry
// bans arrive with #122, internal bookings with #123, request approval with #125; the booking, log and maintenance features arrive with their stories.
export const features = [
  {
    id: 'facilities.view',
    title: 'View facilities: zones, closures, rates and the facility calendar',
    module: 'facilities',
  },
  {
    id: 'facilities.manage',
    title: 'Manage facility rules: zones, closures, rates and booking availability',
    module: 'facilities',
    dependsOn: ['facilities.view'],
  },
  {
    id: 'facilities.rentals.manage',
    title: 'Enter external rentals and manage their status: confirm, cancel, move, no-show',
    module: 'facilities',
    dependsOn: ['facilities.view'],
  },
  {
    id: 'facilities.rentals.approve',
    title: 'Decide on online booking requests: approve (with the renter and the amount) or reject',
    module: 'facilities',
    dependsOn: ['facilities.view'],
  },
  {
    id: 'facilities.bookings.create',
    title: 'Book a club place at once (internal booking) and cancel own bookings',
    module: 'facilities',
    dependsOn: ['facilities.view'],
  },
  {
    // #126: the facility log and reporting incidents (M-12, B-27).
    id: 'facilities.log.write',
    title: 'Keep the facility log and report incidents',
    module: 'facilities',
    dependsOn: ['facilities.view'],
  },
  {
    id: 'facilities.incidents.manage',
    title: 'Manage incidents and entry bans',
    module: 'facilities',
    dependsOn: ['facilities.view'],
  },
]

export default features
