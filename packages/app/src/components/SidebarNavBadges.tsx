'use client'
// Menu counts on the main sidebar items (navigation spec REQ-N03, DD-N05; #260, #413). The count widgets publish into
// the platform store (`setNavBadge`), but `@open-mercato/ui@0.9.0` renders that store only in the settings and profile
// section sidebars (`AppShell.tsx` `renderSectionItem`), not on the main items; the platform's `develop` line renders it
// there too. Until the app upgrades to a release that does, this bridge draws the same chip as the platform's
// `NavItemBadge` into every main sidebar link, read from the same store. Remove it with that upgrade, or each link
// shows two chips (lesson `platform-nav-badges-not-on-main-sidebar`).
import * as React from 'react'
import { createPortal } from 'react-dom'
import { useNavBadge } from '@open-mercato/ui/backend/nav/navBadges'

const SIDEBAR_LINKS = 'nav[data-testid="sidebar"] a[href]'
const HOST_ATTRIBUTE = 'data-vereino-nav-badge'

type Host = { element: HTMLElement; href: string; compact: boolean }

function sameHosts(left: readonly Host[], right: readonly Host[]): boolean {
  return (
    left.length === right.length &&
    left.every(
      (host, index) =>
        host.element === right[index].element &&
        host.href === right[index].href &&
        host.compact === right[index].compact,
    )
  )
}

/** One chip host per main sidebar link: a `display: contents` span, so an empty host takes no room. */
function collectHosts(): Host[] {
  const hosts: Host[] = []
  for (const link of Array.from(document.querySelectorAll<HTMLAnchorElement>(SIDEBAR_LINKS))) {
    const href = link.getAttribute('href')
    if (!href) continue
    let element = link.querySelector<HTMLElement>(`:scope > span[${HOST_ATTRIBUTE}]`)
    if (!element) {
      element = document.createElement('span')
      element.setAttribute(HOST_ATTRIBUTE, '')
      element.style.display = 'contents'
      link.appendChild(element)
    }
    // The collapsed sidebar gives its links a `title` (the hidden label), as the platform chip reads `compact`.
    hosts.push({ element, href, compact: link.hasAttribute('title') })
  }
  return hosts
}

/** The platform `NavItemBadge`, drawn into a host: nothing at zero, "99+" above 99, the spoken label as its name. */
function NavLinkBadge({ host }: { host: Host }) {
  const badge = useNavBadge(host.href)
  if (!badge || badge.count <= 0) return null
  const display = badge.count > 99 ? '99+' : String(badge.count)
  const tone =
    badge.tone === 'attention' ? 'bg-status-warning-bg text-status-warning-text' : 'bg-muted text-muted-foreground'
  return createPortal(
    <span
      role="img"
      className={`ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium ${tone} ${
        host.compact ? 'absolute right-0 top-0 -mr-1 -mt-1' : ''
      }`}
      aria-label={badge.label ?? display}
    >
      {display}
    </span>,
    host.element,
  )
}

/** Mounted once inside the backend `AppShell`; follows the sidebar as it loads, refreshes, collapses and opens. */
export function SidebarNavBadges() {
  const [hosts, setHosts] = React.useState<Host[]>([])
  React.useEffect(() => {
    let frame = 0
    const sync = () => {
      frame = 0
      const next = collectHosts()
      setHosts((previous) => (sameHosts(previous, next) ? previous : next))
    }
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(sync)
    }
    sync()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['title'] })
    return () => {
      observer.disconnect()
      if (frame !== 0) window.cancelAnimationFrame(frame)
    }
  }, [])
  return (
    <>
      {hosts.map((host, index) => (
        <NavLinkBadge key={`${host.href}#${index}`} host={host} />
      ))}
    </>
  )
}
