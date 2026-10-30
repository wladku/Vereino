// `MemberShell` of `@vereino/ui` rendered through the app's own Jest setup (foundation II P-23): proves the package
// resolves from the app and keeps the `/club` markup of #27 (brand, logo, navigation with `aria-current`, banner, main).
import { describe, expect, it } from '@jest/globals'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemberShell, type MemberLinkProps, type MemberNavItem } from '@vereino/ui'

const Link = (p: MemberLinkProps) => (
  <a href={p.href} className={p.className} aria-current={p['aria-current']}>
    {p.children}
  </a>
)

const nav: MemberNavItem[] = [
  { href: '/club', label: 'Today', current: true },
  { href: '/club/calendar', label: 'Calendar', current: false },
]

function render(props: Partial<React.ComponentProps<typeof MemberShell>> = {}) {
  return renderToStaticMarkup(
    <MemberShell brand={{ name: 'KS Avocado' }} nav={nav} navLabel="Member area" Link={Link} {...props}>
      <p>body</p>
    </MemberShell>,
  )
}

describe('MemberShell', () => {
  it('renders the brand, the navigation and the body', () => {
    const html = render()
    expect(html).toContain('data-testid="club-name"><span>KS Avocado</span>')
    expect(html).toContain('<nav aria-label="Member area"')
    expect(html).toContain(
      '<a href="/club" class="text-foreground inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold underline underline-offset-4" aria-current="page">Today</a>',
    )
    expect(html).toContain(
      '<a href="/club/calendar" class="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center rounded-md px-3 text-sm">Calendar</a>',
    )
    expect(html).toContain('<main class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6"><p>body</p></main>')
    expect(html).not.toContain('club-logo')
  })

  it('renders the logo only when the brand has one', () => {
    const html = render({ brand: { name: 'KS Avocado', logoUrl: '/logo.png' } })
    expect(html).toContain(
      '<img src="/logo.png" alt="" width="32" height="32" class="bg-muted size-8 rounded object-contain" data-testid="club-logo"/>',
    )
  })

  it('renders no navigation without items and the banner between header and main', () => {
    const html = render({ nav: [], banner: <div data-testid="banner">conflict</div> })
    expect(html).not.toContain('<nav')
    expect(html).toContain('</header><div data-testid="banner">conflict</div><main')
  })
})
