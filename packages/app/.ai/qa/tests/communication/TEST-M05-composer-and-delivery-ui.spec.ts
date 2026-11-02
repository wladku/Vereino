import { expect, test } from '@playwright/test'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { familyFor } from '../_fixtures/attendance'
import { createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { audienceTargets, previewAudience, settledDeliveries } from '../_fixtures/communication'
import { runProbe } from '../_fixtures/messaging'

// TEST-M05 (foundation III REQ-M05, AC-M05; P-32): the composer's `AudiencePicker` offers a coach only the group,
// activity and session kinds and only his groups, the coordinator also her sections and the administrator also the
// whole club, with live recipient counts; the thread page's `DeliveryStatusList` shows every recipient with "not
// delivered" for a failed e-mail and a working "problems only" filter. Keyboard-operable; axe in light and dark mode at
// 375 px on the list, the composer and the thread page.
test.describe.configure({ timeout: 600_000 })

test('TEST-M05 composer and delivery status: kinds and targets by grant, live counts, not delivered and problems only, keyboard, axe at 375 px in both schemes', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-m05')
  try {
    const family = await familyFor(request, club)
    const coach = family.coach

    // Kinds by grant (the API the picker reads).
    expect((await audienceTargets(request, coach.token)).body?.kinds).toEqual(['group', 'activity', 'occurrence'])
    expect((await audienceTargets(request, family.academyCoordinator.token)).body?.kinds).toEqual([
      'section',
      'group',
      'activity',
      'occurrence',
    ])
    expect((await audienceTargets(request, club.adminToken)).body?.kinds).toEqual([
      'club',
      'section',
      'group',
      'activity',
      'occurrence',
    ])
    expect((await audienceTargets(request, coach.token, 'group')).body?.items?.map((item) => item.id)).toEqual([
      family.zaki,
    ])
    expect((await audienceTargets(request, coach.token, 'section')).body?.items).toEqual([])
    // Counts only: Anna, Kuba and Piotr (the coach is the author); the pool group is outside the coach's grants.
    const counts = await previewAudience(request, coach.token, { kind: 'group', ids: [family.zaki] })
    expect(counts.body).toEqual({ recipients: 3, withoutEmail: 0, unreachable: 0 })
    const foreign = await previewAudience(request, coach.token, { kind: 'group', ids: [family.poolGroup] })
    expect(foreign.status).toBe(403)

    // A thread whose e-mail to Piotr is rejected by the provider: posted through the probe with a scripted sender.
    const scope = { tenantId: club.tenant.tenantId, organizationId: club.tenant.organizationId }
    const probe = runProbe(scope, [
      { op: 'senders', map: { [family.other.guardian.email]: 'permanent' } },
      {
        op: 'command',
        id: 'communication.threads.create',
        authorUserId: coach.userId,
        input: {
          audience: { kind: 'group', ids: [family.zaki] },
          subject: 'Zmiana godziny meczu',
          body: 'Mecz o 11:00.',
        },
      },
      { op: 'drain' },
    ])
    expect(probe.result.failure).toBeNull()
    const created = (probe.result.outputs[1] as { results: { result?: { threadId?: string }; error?: unknown }[] })
      .results[0]
    expect(created?.error, JSON.stringify(created?.error)).toBeUndefined()
    const failedThreadId = String(created?.result?.threadId)
    const settled = await settledDeliveries(request, coach.token, failedThreadId)
    expect(
      settled.find((item) => item.personId === family.other.guardian.personId && item.channel === 'email'),
    ).toMatchObject({ status: 'failed', failureCode: 'provider_rejected' })

    page.setDefaultTimeout(30_000)
    await signInBrowser(page, request, club, coach.userId, coach.email)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    const violations: Record<string, unknown> = {}
    const scan = async (label: string, ready: () => Promise<void>) => {
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
        await page.reload()
        await ready()
        const found = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
        if (found.length > 0) violations[`${label} (${colorScheme})`] = found
      }
      await expectNoPageOverflow(page)
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    }

    // The thread list.
    await page.goto('/backend/communication/threads')
    await expect(page.getByTestId('thread-link').filter({ hasText: 'Zmiana godziny meczu' })).toBeVisible()
    await scan('/backend/communication/threads', async () => {
      await expect(page.getByTestId('thread-link').first()).toBeVisible()
    })

    // The composer: the coach's kinds, his group only, the live count; keyboard only.
    await page.goto('/backend/communication/threads/create')
    await page.waitForLoadState('networkidle')
    const kind = page.getByTestId('audience-picker-kind')
    await expect(kind.locator('option[value="group"]')).toHaveCount(1)
    await expect(kind.locator('option[value="section"]')).toHaveCount(0)
    await expect(kind.locator('option[value="club"]')).toHaveCount(0)
    await kind.focus()
    await kind.selectOption('group')
    const targets = page.getByTestId('audience-picker-targets')
    await expect(targets.getByRole('radio')).toHaveCount(1)
    await expect(targets).toContainText('Żaki')
    await expect(targets).not.toContainText('Basen')
    await targets.getByRole('radio').first().focus()
    await page.keyboard.press('Space')
    await expect(page.getByTestId('audience-picker-count')).toContainText('3')
    await scan('/backend/communication/threads/create', async () => {
      await expect(page.getByTestId('audience-picker-kind')).toBeVisible()
    })

    // The thread page with mixed delivery states: "not delivered" for Piotr, "problems only" by keyboard.
    await page.goto(`/backend/communication/threads/${failedThreadId}`)
    const list = page.getByTestId('delivery-status-list')
    await expect(list.getByTestId('delivery-row').first()).toBeVisible()
    await expect(list.locator('[data-testid="delivery-row"][data-status="failed"]')).toHaveCount(1)
    await expect(list.locator('[data-testid="delivery-row"][data-status="failed"]')).toContainText(
      /Not delivered|Niedoręczone/,
    )
    await expect(list.locator('[data-testid="delivery-row"][data-status="sent"]')).toHaveCount(5)
    const problemsOnly = page.getByTestId('delivery-problems-only')
    await problemsOnly.focus()
    await page.keyboard.press('Space')
    await expect(list.locator('[data-testid="delivery-row"]')).toHaveCount(1)
    await expect(list.locator('[data-testid="delivery-row"]')).toHaveAttribute('data-status', 'failed')
    await scan(`/backend/communication/threads/[id]`, async () => {
      await expect(page.getByTestId('delivery-status-list').getByTestId('delivery-row').first()).toBeVisible()
    })

    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
