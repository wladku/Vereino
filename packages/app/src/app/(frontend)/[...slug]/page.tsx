import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { findRouteManifestMatch, getFrontendRouteManifests, registerFrontendRouteManifests } from '@open-mercato/shared/modules/registry'
import { frontendRoutes } from '@/.mercato/generated/frontend-routes.generated'
import { getAuthFromCookies } from '@open-mercato/shared/lib/auth/server'
import { AccessDeniedMessage } from '@open-mercato/ui/backend/detail'
import { AccessDeniedActions } from '@/components/AccessDeniedActions'
import type { AuthContext } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import type { CustomerRbacService } from '@open-mercato/core/modules/customer_accounts/services/customerRbacService'
import { Organization } from '@open-mercato/core/modules/directory/data/entities'
import type { Metadata } from 'next'
import type { EntityManager } from '@mikro-orm/postgresql'
import { resolveLocalizedTitleMetadata } from '@/lib/metadata'
import type { ClubCorePublicSite } from '@/modules/club_core/services/public-site'
import { instancePageRedirect, publicPageRedirect, requestHost } from '@/modules/club_core/lib/club-host'
import { requestClub, sessionRedirectForHost } from '@/modules/club_core/services/request-club'
import { resolvePageMiddlewareRedirect } from '@open-mercato/shared/lib/middleware/page-executor'
import { frontendMiddlewareEntries } from '@/.mercato/generated/frontend-middleware.generated'

registerFrontendRouteManifests(frontendRoutes)

type SearchParams = Record<string, string | string[] | undefined>

type FrontendParams = { params: Promise<{ slug: string[] }>; searchParams?: Promise<SearchParams> }

/**
 * A module page may carry its own document metadata as a static `generateMetadata` on its default export (the route
 * loader hands over only the default export): the Vereino public club pages title themselves with the club's name and
 * add Open Graph tags (#487). Null keeps the route's own title.
 */
type PageWithMetadata = {
  generateMetadata?: (props: { params: Record<string, string | string[]>; searchParams: SearchParams }) => Promise<Metadata | null>
}

async function ensureServerBootstrap() {
  const { bootstrap } = await import('@/bootstrap')
  bootstrap()
}

async function renderAccessDenied() {
  const { translate } = await resolveTranslations()
  return (
    <AccessDeniedMessage
      label={translate('auth.accessDenied.title', 'Access Denied')}
      description={translate('auth.accessDenied.message', 'You do not have permission to view this page. Please contact your administrator.')}
      action={
        <AccessDeniedActions
          homeHref="/club"
          homeLabel={translate('vereino.accessDenied.memberHome', 'Go to the member interface')}
          signOutLabel={translate('vereino.accessDenied.signOut', 'Sign out and use another account')}
        />
      }
    />
  )
}

export async function generateMetadata({ params, searchParams }: FrontendParams): Promise<Metadata> {
  const p = await params
  const pathname = '/' + (p.slug?.join('/') ?? '')
  const match = findRouteManifestMatch(getFrontendRouteManifests(), pathname)
  if (!match) {
    return {}
  }

  const routeMetadata = await resolveLocalizedTitleMetadata({
    title: match.route.title,
    titleKey: match.route.titleKey,
    clubName: await publicClubName(match.params ?? {}),
  })
  if (match.route.requireAuth || match.route.requireCustomerAuth) return routeMetadata
  const Component = (await match.route.load()) as PageWithMetadata
  if (typeof Component.generateMetadata !== 'function') return routeMetadata
  const pageMetadata = await Component.generateMetadata({ params: match.params, searchParams: (await searchParams) ?? {} })
  return pageMetadata ? { ...routeMetadata, ...pageMetadata } : routeMetadata
}

/**
 * The club of a public page under `/p/[clubSlug]` for its tab title ("{club} — {page}", #485), read through the
 * approved public slug lookup of `clubCorePublicSite`. A section or club event page names the club only when that
 * section or event is public itself, so a not-found page never carries club data (E02-S05). Null for any other page,
 * a club that does not publish its page, or on any failure (the title then names the product).
 */
async function publicClubName(params: Record<string, unknown>): Promise<string | null> {
  const text = (value: unknown): string | null => (typeof value === 'string' && value ? value : null)
  const clubSlug = text(params.clubSlug)
  if (!clubSlug) return null
  try {
    await ensureServerBootstrap()
    const container = await createRequestContainer()
    if (!container.hasRegistration('clubCorePublicSite')) return null
    const site = container.resolve<ClubCorePublicSite>('clubCorePublicSite')
    const frame = await site.clubFrame(clubSlug)
    if (frame.status !== 'ok') return null
    const sectionSlug = text(params.sectionSlug)
    if (sectionSlug && (await site.sectionPage(clubSlug, sectionSlug)).status !== 'ok') return null
    const eventSlug = text(params.eventSlug)
    if (eventSlug && (await site.publicClubEvent(clubSlug, eventSlug)).status !== 'ok') return null
    return frame.value.club.name
  } catch {
    return null
  }
}

/** The path with its query string, rebuilt from the route's search params. */
function pathAndQuery(pathname: string, query: SearchParams): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue
    for (const entry of Array.isArray(value) ? value : [value]) params.append(key, entry)
  }
  const search = params.toString()
  return search ? `${pathname}?${search}` : pathname
}

export default async function SiteCatchAll({ params, searchParams }: FrontendParams) {
  const p = await params
  const query = (await searchParams) ?? {}
  const pathname = '/' + (p.slug?.join('/') ?? '')
  const match = findRouteManifestMatch(getFrontendRouteManifests(), pathname)
  if (!match) return notFound()

  // Many clubs spec phase 3 (DD-M03, #631): with `VEREINO_CLUB_DOMAIN` set, a public club page opened anywhere but at its
  // club's address moves there, and the platform's reset pages, which stay on `APP_URL` for now, move back to it.
  const host = requestHost((await headers()).get('host'), process.env)
  const clubSlug = typeof match.params?.clubSlug === 'string' ? match.params.clubSlug : null
  const moved =
    instancePageRedirect({ host, pathAndQuery: pathAndQuery(pathname, query), env: process.env }) ??
    (clubSlug && pathname.startsWith('/p/')
      ? publicPageRedirect({ host, clubSlug, pathAndQuery: pathAndQuery(pathname, query), env: process.env })
      : null)
  if (moved) redirect(moved)

  // Customer portal auth gate — separate from staff auth
  if (match.route.requireCustomerAuth) {
    const { getCustomerAuthFromCookies } = await import('@open-mercato/core/modules/customer_accounts/lib/customerAuthServer')
    const customerAuth = await getCustomerAuthFromCookies()
    const segments = pathname.split('/').filter(Boolean)
    const orgSlug = segments[0] ?? ''
    if (!customerAuth) {
      redirect(`/${orgSlug}/portal/login`)
    }
    await ensureServerBootstrap()
    const portalContainer = await createRequestContainer()
    const em = portalContainer.resolve('em') as EntityManager
    const org = orgSlug
      ? await em.findOne(Organization, {
          id: customerAuth.orgId,
          slug: orgSlug,
          deletedAt: null,
        } as any)
      : null
    const organizationId = org ? String(org.id) : null
    if (!organizationId || organizationId !== customerAuth.orgId) return renderAccessDenied()

    const customerFeatures = match.route.requireCustomerFeatures
    if (customerFeatures && customerFeatures.length) {
      const customerRbac = portalContainer.resolve('customerRbacService') as CustomerRbacService
      const ok = await customerRbac.userHasAllFeatures(
        customerAuth.sub,
        customerFeatures as string[],
        { tenantId: customerAuth.tenantId, organizationId: customerAuth.orgId },
      )
      if (!ok) return renderAccessDenied()
    }
    const Component = await match.route.load()
    return <Component params={match.params} />
  }

  // Staff auth gate
  let auth: AuthContext = null
  let container: Awaited<ReturnType<typeof createRequestContainer>> | null = null
  const ensureContainer = async () => {
    if (!container) {
      await ensureServerBootstrap()
      container = await createRequestContainer()
    }
    return container
  }
  if (match.route.requireAuth) {
    auth = await getAuthFromCookies()
    if (!auth) redirect('/api/auth/session/refresh?redirect=' + encodeURIComponent(pathname))
    // A session of another club on a club's address goes to its own club's address (fail closed; #631).
    if (host.kind === 'club') {
      const elsewhere = await sessionRedirectForHost(await requestClub(), auth, pathAndQuery(pathname, query))
      if (elsewhere) redirect(elsewhere)
    }
    const required = match.route.requireRoles || []
    if (required.length) {
      const roles = auth.roles || []
      const ok = required.some(r => roles.includes(r))
      if (!ok) return renderAccessDenied()
    }
    const features = match.route.requireFeatures
    if (features && features.length) {
      const scopeContainer = await ensureContainer()
      const rbac = scopeContainer.resolve('rbacService') as RbacService
      const ok = await rbac.userHasAllFeatures(auth.sub, features, { tenantId: auth.tenantId, organizationId: auth.orgId })
      if (!ok) return renderAccessDenied()
    }
  }
  const middlewareRedirect = await resolvePageMiddlewareRedirect({
    entries: frontendMiddlewareEntries,
    context: {
      pathname,
      mode: 'frontend',
      routeMeta: {
        requireAuth: match.route.requireAuth,
        requireRoles: match.route.requireRoles,
        requireFeatures: match.route.requireFeatures,
      },
      auth,
      ensureContainer,
    },
  })
  if (middlewareRedirect) redirect(middlewareRedirect)
  const Component = await match.route.load()
  return <Component params={match.params} searchParams={query} />
}
