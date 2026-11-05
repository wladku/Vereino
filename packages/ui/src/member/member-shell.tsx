// The frame of the member pages (club spec DD-05 *UI architecture*; foundation II P-23; README 3.1; E06-S19 #101): the
// club's brand and the header switchers (role context, ward), the page body, and the bottom bar Today · Calendar ·
// Messages · [fourth tab] · More, where More opens Profile, the admin panel for staff and Sign out. Framework-free:
// the router's link component, the navigation (`memberNav`) and every string come in through props. More is a native
// disclosure (`<details>`), so the shell holds no state; sign-out posts to the installed `auth` logout route, which
// ends the session and redirects to `/login`; a page restored from the back-forward cache reloads, so Back after
// sign-out never shows the previous member's page. Every bar target is at least 48 × 48 px.
import * as React from 'react'
import { CalendarDays, House, LogOut, MapPin, Menu, MessageSquare, Wallet } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { reloadOnBackForwardRestore } from '#src/member/member-context'
import { SIGN_OUT_ACTION, type MemberNav, type MemberTabIcon } from '#src/member/member-nav'

export type MemberLinkProps = {
  href: string
  className?: string
  children: React.ReactNode
  'aria-current'?: 'page'
}

/** A header select: the role context or the ward. */
export type MemberSwitcher = {
  id: string
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}

export type MemberShellProps = {
  brand: { name: string; logoUrl?: string | null }
  /** `null` until the profile is loaded: a user linked to no person sees no navigation. */
  nav: MemberNav | null
  navLabel: string
  signOutLabel: string
  /** Runs right before the sign-out form posts (the frames clear the member context here). */
  onSignOut?: () => void
  switchers?: MemberSwitcher[]
  Link: React.ComponentType<MemberLinkProps>
  banner?: React.ReactNode
  children: React.ReactNode
}

const ICONS: Record<MemberTabIcon, React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  today: House,
  calendar: CalendarDays,
  messages: MessageSquare,
  payments: Wallet,
  facilities: MapPin,
  more: Menu,
}

const TAB_CLASS =
  'focus-visible:shadow-focus flex min-h-14 min-w-12 flex-1 cursor-pointer list-none flex-col items-center justify-center gap-1 rounded-md px-1 text-xs outline-none [&::-webkit-details-marker]:hidden'
const TAB_CURRENT_CLASS = `${TAB_CLASS} text-primary font-semibold`
const TAB_IDLE_CLASS = `${TAB_CLASS} text-muted-foreground hover:text-foreground`
const MAIN_CLASS = 'mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6'
// The fixed bottom bar must not cover the end of the page.
const MAIN_WITH_BAR_CLASS = `${MAIN_CLASS} pb-28`
const MORE_ITEM_CLASS =
  'hover:bg-accent focus-visible:shadow-focus flex min-h-12 w-full items-center gap-2 rounded-md px-3 text-sm outline-none'

function TabContent({ icon, label }: { icon: MemberTabIcon; label: string }) {
  const Icon = ICONS[icon]
  return (
    <>
      <Icon className="size-5" aria-hidden />
      <span>{label}</span>
    </>
  )
}

function Switcher({ switcher }: { switcher: MemberSwitcher }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-none" data-testid={`club-switcher-${switcher.id}`}>
      <label htmlFor={`club-switcher-${switcher.id}`} className="text-muted-foreground text-xs font-medium">
        {switcher.label}
      </label>
      <Select value={switcher.value} onValueChange={switcher.onChange}>
        <SelectTrigger id={`club-switcher-${switcher.id}`} className="min-h-11 w-full sm:w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {switcher.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function BottomBar({
  nav,
  navLabel,
  signOutLabel,
  onSignOut,
  Link,
}: {
  nav: MemberNav
  navLabel: string
  signOutLabel: string
  onSignOut?: () => void
  Link: React.ComponentType<MemberLinkProps>
}) {
  return (
    <nav
      aria-label={navLabel}
      className="bg-card fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)]"
      data-testid="club-bottom-bar"
    >
      <div className="mx-auto flex max-w-3xl items-stretch gap-1 px-2 py-1">
        {nav.tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.current ? 'page' : undefined}
            className={tab.current ? TAB_CURRENT_CLASS : TAB_IDLE_CLASS}
          >
            <TabContent icon={tab.icon} label={tab.label} />
          </Link>
        ))}
        <details className="relative flex flex-1" data-testid="club-more">
          <summary
            className={nav.more.current ? TAB_CURRENT_CLASS : TAB_IDLE_CLASS}
            aria-current={nav.more.current ? 'page' : undefined}
          >
            <TabContent icon="more" label={nav.more.label} />
          </summary>
          <div className="bg-popover text-popover-foreground absolute right-0 bottom-full mb-2 flex w-56 flex-col gap-1 rounded-lg border p-1 shadow-md">
            {nav.more.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={item.current ? 'page' : undefined}
                className={item.current ? `${MORE_ITEM_CLASS} font-semibold` : MORE_ITEM_CLASS}
              >
                {item.label}
              </Link>
            ))}
            <form method="post" action={SIGN_OUT_ACTION} onSubmit={onSignOut}>
              <button type="submit" className={MORE_ITEM_CLASS} data-testid="club-sign-out">
                <LogOut className="size-4" aria-hidden />
                <span>{signOutLabel}</span>
              </button>
            </form>
          </div>
        </details>
      </div>
    </nav>
  )
}

export function MemberShell({
  brand,
  nav,
  navLabel,
  signOutLabel,
  onSignOut,
  switchers = [],
  Link,
  banner,
  children,
}: MemberShellProps) {
  React.useEffect(reloadOnBackForwardRestore, [])
  return (
    <div className="bg-background text-foreground min-h-svh">
      <header className="bg-card border-b">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 px-4 py-2">
          <p className="flex items-center gap-2 text-sm font-semibold" data-testid="club-name">
            {brand.logoUrl ? (
              <img
                src={brand.logoUrl}
                alt=""
                width={32}
                height={32}
                className="bg-muted size-8 rounded object-contain"
                data-testid="club-logo"
              />
            ) : null}
            <span>{brand.name}</span>
          </p>
          {switchers.length > 0 ? (
            <div className="flex flex-wrap gap-3" data-testid="club-switchers">
              {switchers.map((switcher) => (
                <Switcher key={switcher.id} switcher={switcher} />
              ))}
            </div>
          ) : null}
        </div>
      </header>
      {banner}
      <main className={nav ? MAIN_WITH_BAR_CLASS : MAIN_CLASS}>{children}</main>
      {nav ? (
        <BottomBar nav={nav} navLabel={navLabel} signOutLabel={signOutLabel} onSignOut={onSignOut} Link={Link} />
      ) : null}
    </div>
  )
}
