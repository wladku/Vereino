// The composer's reads (foundation III REQ-M05, P-32 `AudiencePicker`; DD-M14): the audience kinds and targets the
// author's grants allow, the live recipient counts of an audience (counts only — never a name), and the share text of
// a session or a thread. Each read checks the author's scope over the target the same way the post command does.
import type { AudienceCounts, AudienceKind, GrantKind } from '@vereino/core'
import {
  assertInScope,
  foundationErrors,
  isUnlinkedScope,
  resolveAudience,
  scopeDenialCode,
} from '@/modules/foundation'
import { communicationErrors } from '../api/errors'
import type { AudienceInput } from '../data/validators'
import {
  absoluteUrl,
  allowedAudienceKinds,
  audienceTarget,
  memberThreadPath,
  postingKinds,
  shareLine,
} from '../lib/thread-rules'
import { shareTextService } from './directory'
import { listAudienceTargets, resolveAudienceTarget, type AudienceTargetOption } from './targets'
import { threadSubject, type Viewer } from './threads'

/**
 * Asserts the author may post to the audience (403 `scope_denied` otherwise) and returns its target. An account not
 * linked to a person of this club gets 403 `scope_unlinked` before the target is looked up, so an unknown target and
 * an existing one answer alike (#155).
 */
async function authorizeAudience(viewer: Viewer, audience: AudienceInput) {
  if (isUnlinkedScope(viewer.grants)) return foundationErrors.throw('scope_unlinked')
  const target = await resolveAudienceTarget(viewer.container, viewer.scope, audience)
  const persons = audience.kind === 'persons'
  await assertInScope(
    viewer.grants,
    postingKinds(audience.kind),
    audienceTarget(target.scopeId ?? viewer.scope.organizationId, viewer.scope, target),
    persons ? { clubWideKinds: ['coach', 'coordinator'] as GrantKind[] } : undefined,
  )
  return target
}

/** The recipient counts of an audience as the post command would resolve it (the author excluded). */
export async function previewAudience(viewer: Viewer, audience: AudienceInput): Promise<AudienceCounts> {
  await authorizeAudience(viewer, audience)
  if (!viewer.personId) return foundationErrors.throw(scopeDenialCode(viewer.grants))
  const resolved = await resolveAudience(
    { kind: audience.kind, ids: audience.ids ?? [] },
    { container: viewer.container, ...viewer.scope, scope: viewer.grants },
    { exclude: [viewer.personId] },
  )
  return resolved.counts
}

/** The composer kinds the author may use, or the targets of one kind. */
export async function composerTargets(
  viewer: Viewer,
  kind: Exclude<AudienceKind, 'club' | 'persons'> | undefined,
  query: string | undefined,
): Promise<{ kinds: AudienceKind[]; items: AudienceTargetOption[] }> {
  const kinds = allowedAudienceKinds(viewer.grants)
  if (!kind) return { kinds, items: [] }
  if (!kinds.includes(kind)) return { kinds, items: [] }
  return { kinds, items: await listAudienceTargets(viewer.container, viewer.scope, viewer.grants, kind, query) }
}

/** The app's public URL (`APP_URL`) without a trailing slash. */
function appUrl(): string {
  return (process.env.APP_URL?.trim() || 'http://localhost:3000').replace(/\/+$/, '')
}

export type ShareText = { text: string; url: string }

/**
 * The share text (DD-M14): for a session, `activities.shareText` with the public session page (the author must be
 * allowed to post to the session); for a thread the reader sees, its subject with the member thread link (sign-in).
 */
export async function shareText(
  viewer: Viewer,
  target: { occurrenceId?: string; threadId?: string },
): Promise<ShareText> {
  if (target.occurrenceId) {
    await authorizeAudience(viewer, { kind: 'occurrence', ids: [target.occurrenceId] })
    const service = shareTextService(viewer.container)
    const text = service ? await service.forOccurrence(viewer.scope, target.occurrenceId) : null
    if (!text) return communicationErrors.throw('share_text_unavailable')
    return text
  }
  const subject = await threadSubject(viewer, target.threadId as string)
  if (subject === null) return communicationErrors.throw('share_text_unavailable')
  const url = absoluteUrl(appUrl(), memberThreadPath(target.threadId as string))
  return { text: shareLine(subject, url), url }
}
