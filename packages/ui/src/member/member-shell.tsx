// The frame of the member pages (club spec DD-05 *UI architecture*; foundation II P-23): the club's brand, the member
// navigation and the page body. Framework-free: the router's link component and every string come in through props,
// so the `people` module passes `next/link` and its `t()` results. The markup is the one `/club` has rendered since #27.
import * as React from 'react'

export type MemberLinkProps = {
  href: string
  className?: string
  children: React.ReactNode
  'aria-current'?: 'page'
}

export type MemberNavItem = { href: string; label: string; current: boolean }

export type MemberShellProps = {
  brand: { name: string; logoUrl?: string | null }
  nav: MemberNavItem[]
  navLabel: string
  Link: React.ComponentType<MemberLinkProps>
  banner?: React.ReactNode
  children: React.ReactNode
}

const NAV_LINK_CURRENT_CLASS =
  'text-foreground inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold underline underline-offset-4'
const NAV_LINK_CLASS =
  'text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center rounded-md px-3 text-sm'

export function MemberShell({ brand, nav, navLabel, Link, banner, children }: MemberShellProps) {
  return (
    <div className="bg-background text-foreground min-h-svh">
      <header className="bg-card border-b">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-2">
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
          {nav.length > 0 ? (
            <nav aria-label={navLabel} className="flex flex-wrap items-center gap-1">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={item.current ? 'page' : undefined}
                  className={item.current ? NAV_LINK_CURRENT_CLASS : NAV_LINK_CLASS}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          ) : null}
        </div>
      </header>
      {banner}
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">{children}</main>
    </div>
  )
}
