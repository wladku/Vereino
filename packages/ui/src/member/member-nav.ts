// The one navigation definition of the member pages (README 3.1 *Member `/club`*; E06-S19 #101): the bottom-bar tabs
// Today · Calendar · Messages · [a fourth tab a later module grants] · More, the entries behind More (Profile, My units
// for a coach (#96), the admin panel for staff) and which of them is current for a path. Framework-free: every label comes in through
// `memberShellLabels`, which reads one fixed list of keys under the calling module's catalog prefix, so the three
// member frames (`people`, `activities`, `communication`) share the definition and keep their own catalogs.

export const CLUB_HOME_HREF = '/club'
export const CLUB_CALENDAR_HREF = '/club/calendar'
export const CLUB_MESSAGES_HREF = '/club/messages'
export const CLUB_PROFILE_HREF = '/club/profile'
/** A coach's own row of the monthly coach units report (#96). */
export const CLUB_MY_UNITS_HREF = '/club/coach/units'
export const BACKEND_HREF = '/backend'
/** The installed `auth` logout route: it revokes the session, clears the cookies and redirects to `/login`. */
export const SIGN_OUT_ACTION = '/api/auth/logout'

export type MemberTabIcon = 'today' | 'calendar' | 'messages' | 'payments' | 'facilities' | 'more'

export type MemberNavItem = { href: string; label: string; current: boolean }
export type MemberTab = MemberNavItem & { icon: MemberTabIcon }

/** A fourth tab a later module grants (Payments in E07, Facilities in E08); `null` until one does. */
export type MemberExtraTab = { href: string; label: string; icon: 'payments' | 'facilities' }

export type MemberShellLabels = {
  nav: string
  today: string
  calendar: string
  messages: string
  more: string
  profile: string
  myUnits: string
  backend: string
  signOut: string
  context: string
  contextMember: string
  contextCoach: string
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
  'backend',
  'signOut',
  'context',
  'contextMember',
  'contextCoach',
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
 * Contexts that work in the admin panel: "Admin panel" is offered for them (the panel authorizes itself). A coach is
 * not one of them (E06-S15 #97): the coach role cannot open the panel's sessions (`activities.view`), so a coach-only
 * person runs their sessions from `/club` and is not sent to a panel without them.
 */
const STAFF_CONTEXTS: readonly string[] = ['club_admin', 'coordinator']

export function hasStaffContext(contexts: readonly string[]): boolean {
  return contexts.some((context) => STAFF_CONTEXTS.includes(context))
}

/** The path is the page itself or one below it. */
function under(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export type MemberNav = {
  tabs: MemberTab[]
  more: { label: string; current: boolean; items: MemberNavItem[] }
}

export type MemberNavInput = {
  pathname: string
  contexts: readonly string[]
  labels: MemberShellLabels
  extraTab?: MemberExtraTab | null
}

export function memberNav({ pathname, contexts, labels, extraTab = null }: MemberNavInput): MemberNav {
  const profileCurrent = under(pathname, CLUB_PROFILE_HREF) || under(pathname, '/club/wards')
  const tabs: MemberTab[] = [
    { href: CLUB_HOME_HREF, label: labels.today, icon: 'today', current: pathname === CLUB_HOME_HREF },
    {
      href: CLUB_CALENDAR_HREF,
      label: labels.calendar,
      icon: 'calendar',
      current: under(pathname, CLUB_CALENDAR_HREF) || under(pathname, '/club/occurrences'),
    },
    {
      href: CLUB_MESSAGES_HREF,
      label: labels.messages,
      icon: 'messages',
      current: under(pathname, CLUB_MESSAGES_HREF),
    },
  ]
  if (extraTab) tabs.push({ ...extraTab, current: under(pathname, extraTab.href) })
  const items: MemberNavItem[] = [{ href: CLUB_PROFILE_HREF, label: labels.profile, current: profileCurrent }]
  // Every role but the club administrator works from the phone (product rule of 2026-11-03): a coach reads their own
  // units here.
  const unitsCurrent = contexts.includes('coach') && under(pathname, CLUB_MY_UNITS_HREF)
  if (contexts.includes('coach')) items.push({ href: CLUB_MY_UNITS_HREF, label: labels.myUnits, current: unitsCurrent })
  if (hasStaffContext(contexts)) items.push({ href: BACKEND_HREF, label: labels.backend, current: false })
  return { tabs, more: { label: labels.more, current: profileCurrent || unitsCurrent, items } }
}
