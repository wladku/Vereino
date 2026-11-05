// `MemberShell` of `@vereino/ui` rendered through the app's own Jest setup (foundation II P-23; E06-S19 #101): proves
// the package resolves from the app and keeps the `/club` markup (brand, logo, bottom bar with `aria-current`, More
// with sign-out, banner, main).
import { describe, expect, it } from '@jest/globals'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemberShell, memberNav, memberShellLabels, type MemberLinkProps } from '@vereino/ui'

const Link = (p: MemberLinkProps) => (
  <a href={p.href} className={p.className} aria-current={p['aria-current']}>
    {p.children}
  </a>
)

const labels = memberShellLabels((key) => key.split('.').at(-1) ?? key, 'people.club.nav')
const nav = memberNav({ pathname: '/club', contexts: ['self'], labels })

function render(props: Partial<React.ComponentProps<typeof MemberShell>> = {}) {
  return renderToStaticMarkup(
    <MemberShell brand={{ name: 'KS Avocado' }} nav={nav} navLabel="Member area" signOutLabel="Sign out" Link={Link} {...props}>
      <p>body</p>
    </MemberShell>,
  )
}

describe('MemberShell', () => {
  it('renders the brand, the body and the bottom bar with the current tab', () => {
    const html = render()
    expect(html).toContain('data-testid="club-name"><span>KS Avocado</span>')
    expect(html).toContain('<nav aria-label="Member area"')
    expect(html).toMatch(/<a href="\/club" class="[^"]*text-primary font-semibold" aria-current="page"><svg/)
    expect(html).toMatch(/<a href="\/club\/calendar" class="[^"]*text-muted-foreground hover:text-foreground"><svg/)
    expect(html).toContain('<form action="/api/auth/logout" method="post">')
    expect(html).toContain('<main class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 pb-28"><p>body</p></main>')
    expect(html).not.toContain('club-logo')
  })

  it('renders the logo only when the brand has one', () => {
    const html = render({ brand: { name: 'KS Avocado', logoUrl: '/logo.png' } })
    expect(html).toContain(
      '<img src="/logo.png" alt="" width="32" height="32" class="bg-muted size-8 rounded object-contain" data-testid="club-logo"/>',
    )
  })

  it('renders no navigation before the profile and the banner between header and main', () => {
    const html = render({ nav: null, banner: <div data-testid="banner">conflict</div> })
    expect(html).not.toContain('<nav')
    expect(html).toContain('</header><div data-testid="banner">conflict</div><main')
  })
})
