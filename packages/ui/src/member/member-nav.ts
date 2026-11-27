// The one navigation definition of the member pages (README 3.1 *Member `/club`*; E06-S19 #101; navigation spec
// REQ-N05, REQ-N06, #258): the bottom-bar tabs Today · Calendar · Messages · [a fourth tab by one rule] · More, the
// entries behind More and which of them is current for a path. One table of member destinations (route, label key,
// feature) drives the bar and More, and every one of the five member frames passes the same input — the profile's
// contexts and `paymentsVisible`, and the granted features out of `MEMBER_NAV_FEATURES` — so the bar is the same on
// every page. The table holds URLs and feature ids as strings: no module imports another. Framework-free: every label
// comes in through `memberShellLabels`, which reads one fixed list of keys under the calling module's catalog prefix,
// so the five frames share the definition and keep their own catalogs.

export const CLUB_HOME_HREF = '/club'
export const CLUB_CALENDAR_HREF = '/club/calendar'
export const CLUB_MESSAGES_HREF = '/club/messages'
export const CLUB_PROFILE_HREF = '/club/profile'
/** A coach's own row of the monthly coach units report (#96). */
export const CLUB_MY_UNITS_HREF = '/club/coach/units'
export const CLUB_PAYMENTS_HREF = '/club/payments'
export const CLUB_PLACES_HREF = '/club/places'
export const CLUB_GROUPS_HREF = '/club/groups'
export const CLUB_FACILITY_TODAY_HREF = '/club/facility'
export const CLUB_ORDERS_HREF = '/club/orders'
export const CLUB_GROUP_PAYMENTS_HREF = '/club/coach/payments'
export const CLUB_CASH_HREF = '/club/cash'
/** The club events a section coordinator or the administrator organises from the phone (club events spec REQ-T12). */
export const CLUB_CLUB_EVENTS_HREF = '/club/club-events'
/** A coach's training outlines in the PZPN template (training outlines spec M-O5, #683). */
export const CLUB_OUTLINES_HREF = '/club/training/outlines'
/** A coordinator's "Declarations in Vereino" for their own sections (product brief Goals, D21, D29; E27-S02, #819). */
export const CLUB_DECLARATION_SHARE_HREF = '/club/reports/declaration-share'
export const BACKEND_HREF = '/backend'
/** The installed `auth` logout route: it revokes the session, clears the cookies and redirects to `/login`. */
export const SIGN_OUT_ACTION = '/api/auth/logout'

export type MemberTabIcon = 'today' | 'calendar' | 'messages' | 'payments' | 'facilities' | 'more'

export type MemberNavItem = { href: string; label: string; current: boolean }
export type MemberTab = MemberNavItem & { icon: MemberTabIcon }

export type MemberShellLabels = {
  nav: string
  today: string
  calendar: string
  messages: string
  more: string
  profile: string
  myUnits: string
  payments: string
  facilities: string
  facilitiesMore: string
  facilityToday: string
  orders: string
  groupPayments: string
  acceptCash: string
  groups: string
  clubEvents: string
  outlines: string
  declarationShare: string
  backend: string
  signOut: string
  context: string
  contextMember: string
  contextCoach: string
  contextCoachCoordinator: string
  ward: string
  allWards: string
  me: string
}

export const MEMBER_SHELL_LABEL_KEYS: readonly (keyof MemberShellLabels)[] = [
  'nav',
  'today',
  'calendar',
  'messages',
  'more',
  'profile',
  'myUnits',
  'payments',
  'facilities',
  'facilitiesMore',
  'facilityToday',
  'orders',
  'groupPayments',
  'acceptCash',
  'groups',
  'clubEvents',
  'outlines',
  'declarationShare',
  'backend',
  'signOut',
  'context',
  'contextMember',
  'contextCoach',
  'contextCoachCoordinator',
  'ward',
  'allWards',
  'me',
]

/** The shell labels read from `<prefix>.<key>` of the calling module's catalog (`label` for `nav`). */
export function memberShellLabels(t: (key: string) => string, prefix: string): MemberShellLabels {
  const labels = {} as MemberShellLabels
  for (const key of MEMBER_SHELL_LABEL_KEYS) labels[key] = t(`${prefix}.${key === 'nav' ? 'label' : key}`)
  return labels
}

/**
 * Contexts that work in the admin panel: "Admin panel" is offered for them (the panel authorizes itself), the facility
 * attendant (spec N, *Menu structure*) and the treasurer (payments spec DD-33, #245) included. A coach is not one of them (E06-S15 #97): the coach role cannot open
 * the panel's sessions (`activities.view`), so a coach-only person runs their sessions from `/club` and is not sent to
 * a panel without them.
 */
const STAFF_CONTEXTS: readonly string[] = ['club_admin', 'coordinator', 'facility_operator', 'treasurer']

export function hasStaffContext(contexts: readonly string[]): boolean {
  return contexts.some((context) => STAFF_CONTEXTS.includes(context))
}

/** A destination behind More, shown when the person holds any of its features. */
export type MemberDestination = {
  href: string
  label: keyof MemberShellLabels
  features: readonly string[]
  /** `false` while the page behind it is not built: the entry stays hidden whatever the grants (V-N04). */
  available: boolean
}

/** The fourth tab: Payments for an adult payer, otherwise Facilities, otherwise none. */
const FACILITIES_TAB_FEATURE = 'facilities.view'

/** The destinations behind More between Profile and the admin panel, in the order More lists them. */
export const MEMBER_MORE_DESTINATIONS: readonly MemberDestination[] = [
  { href: CLUB_MY_UNITS_HREF, label: 'myUnits', features: ['activities.reports.view_own'], available: true },
  // The rosters of a coordinator's sections, a coach's own groups (spec A, REQ-A11, #274).
  { href: CLUB_GROUPS_HREF, label: 'groups', features: ['groups.view'], available: true },
  // Listed only while Facilities is not the fourth tab (one entry per destination, A-N07).
  {
    href: CLUB_PLACES_HREF,
    label: 'facilitiesMore',
    features: [FACILITIES_TAB_FEATURE, 'facilities.maintenance.manage'],
    available: true,
  },
  { href: CLUB_FACILITY_TODAY_HREF, label: 'facilityToday', features: ['facilities.log.write'], available: true },
  { href: CLUB_ORDERS_HREF, label: 'orders', features: ['payments.orders.place'], available: true },
  { href: CLUB_GROUP_PAYMENTS_HREF, label: 'groupPayments', features: ['payments.groups.view'], available: true },
  { href: CLUB_CASH_HREF, label: 'acceptCash', features: ['payments.cash.record'], available: true },
  // Tournaments and other club events with their parts (club events spec REQ-T12, E14-S05 #380).
  { href: CLUB_CLUB_EVENTS_HREF, label: 'clubEvents', features: ['activities.manage'], available: true },
  // Training outlines of a coach, a coordinator or the administrator (training outlines spec M-O5, #683).
  { href: CLUB_OUTLINES_HREF, label: 'outlines', features: ['training.outlines.write'], available: true },
  // The share of declarations made in Vereino for a coordinator's sections, every section for the administrator
  // (product brief Goals, D21, D29; E27-S02, #819). A coach holds `activities.reports.view_own` only: no entry.
  {
    href: CLUB_DECLARATION_SHARE_HREF,
    label: 'declarationShare',
    features: ['activities.reports.view'],
    available: true,
  },
]

/** The fixed feature list the frames check once per session (`useMemberNavFeatures`). */
export const MEMBER_NAV_FEATURES: readonly string[] = [
  ...new Set([
    FACILITIES_TAB_FEATURE,
    ...MEMBER_MORE_DESTINATIONS.filter((entry) => entry.available).flatMap((entry) => entry.features),
  ]),
]

/** The path is the page itself or one below it. */
function under(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** Pages of the member area that belong to Profile in More: the profile and a ward's page. */
const PROFILE_PATHS: readonly string[] = [CLUB_PROFILE_HREF, '/club/wards']
/** Pages that belong to More whatever the grants: the profile pages and every More destination. */
const MORE_PATHS: readonly string[] = [...PROFILE_PATHS, ...MEMBER_MORE_DESTINATIONS.map((entry) => entry.href)]

export type MemberNav = {
  tabs: MemberTab[]
  more: { label: string; current: boolean; items: MemberNavItem[] }
}

export type MemberNavInput = {
  pathname: string
  contexts: readonly string[]
  labels: MemberShellLabels
  /** The profile's `paymentsVisible`: the person holds `payments.view_own` and is an adult (payments R10). */
  paymentsVisible?: boolean
  /**
   * The granted features out of `MEMBER_NAV_FEATURES`; `null` while the check is pending or after it failed — the bar
   * then shows the three fixed tabs and More with Profile (degraded, no error).
   */
  features: readonly string[] | null
}

function fourthTab({ labels, paymentsVisible, features }: MemberNavInput): Omit<MemberTab, 'current'> | null {
  if (!features) return null
  if (paymentsVisible) return { href: CLUB_PAYMENTS_HREF, label: labels.payments, icon: 'payments' }
  if (features.includes(FACILITIES_TAB_FEATURE)) {
    return { href: CLUB_PLACES_HREF, label: labels.facilities, icon: 'facilities' }
  }
  return null
}

export function memberNav(input: MemberNavInput): MemberNav {
  const { pathname, contexts, labels, features } = input
  const extra = fourthTab(input)
  const tabs: MemberTab[] = [
    { href: CLUB_HOME_HREF, label: labels.today, icon: 'today', current: pathname === CLUB_HOME_HREF },
    {
      href: CLUB_CALENDAR_HREF,
      label: labels.calendar,
      icon: 'calendar',
      current: [CLUB_CALENDAR_HREF, '/club/occurrences', '/club/events'].some((href) => under(pathname, href)),
    },
    {
      href: CLUB_MESSAGES_HREF,
      label: labels.messages,
      icon: 'messages',
      current: under(pathname, CLUB_MESSAGES_HREF),
    },
  ]
  if (extra) {
    // An order belongs to Payments (a kit order is paid there).
    const claims = extra.href === CLUB_PAYMENTS_HREF ? [CLUB_PAYMENTS_HREF, CLUB_ORDERS_HREF] : [extra.href]
    tabs.push({ ...extra, current: claims.some((href) => under(pathname, href)) })
  }
  // One current mark per page: a path a tab claims (an order under Payments) marks no More entry, and More is current on
  // its pages, whatever the grants, unless a tab already claims the path.
  const tabCurrent = tabs.some((tab) => tab.current)
  const moreCurrent = !tabCurrent && MORE_PATHS.some((href) => under(pathname, href))
  const items: MemberNavItem[] = [
    { href: CLUB_PROFILE_HREF, label: labels.profile, current: PROFILE_PATHS.some((href) => under(pathname, href)) },
  ]
  for (const entry of MEMBER_MORE_DESTINATIONS) {
    if (!entry.available || !features || entry.href === extra?.href) continue
    if (!entry.features.some((feature) => features.includes(feature))) continue
    items.push({ href: entry.href, label: labels[entry.label], current: !tabCurrent && under(pathname, entry.href) })
  }
  if (hasStaffContext(contexts)) items.push({ href: BACKEND_HREF, label: labels.backend, current: false })
  return { tabs, more: { label: labels.more, current: moreCurrent, items } }
}
