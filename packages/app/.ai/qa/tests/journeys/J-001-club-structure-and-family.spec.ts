import { expect, test, type Locator, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import {
  OPTIMISTIC_LOCK_HEADER,
  birthDateTurning,
  call,
  createClub,
  createPerson,
  createStaff,
  expectRoles,
  getPerson,
  uniqueSuffix,
} from '../_fixtures/club'
import { list, signInBrowser } from '../_fixtures/club-structure'
import { acceptInvitation, capturedEmails, checkOwnPayments, getMe, signInThroughForm } from '../_fixtures/members'
import { guardianships, persons } from '../_fixtures/people'
import { getSettings, publicGet, type PublicSectionPage } from '../_fixtures/publication'

// J-001 (club spec *User Journeys*, phase 1) end to end on one fresh tenant, driven through the pages the way the club
// administrator, the guardian and the ward use them — the phase 1 exit gate of epic #21. The API is used only for the
// setup J-001 does not describe (the two coordinators' person records, Marek's sign-in), for the step that happens
// outside the browser (the invitation e-mail, read from the test mailbox) and to check what was stored. The exit gate
// rides on the same tenant: axe in light and dark mode at 375 px on one page each of `/backend/club/*`,
// `/backend/people/*`, `/club` and `/p/[clubSlug]`, the "Access denied" page for a user without the feature, and the
// public section page with exactly the blocks the publication settings enable. Where the installed product differs
// from J-001's wording, the installed behaviour accepted with stories #25–#29 is asserted (see the comments).
test.describe.configure({ timeout: 600_000 })

const SECTIONS = ['Akademia piłkarska', 'Basen', 'Zumba', 'Szachy', 'Cheerleader'] as const
const FAMILY_NAME = 'Nowak'
const NO_COORDINATOR = /^No coordinator$|^Brak koordynatora$/
const ACCESS_DENIED = /Access Denied|Brak dostępu/
const CONFLICT = /modified by someone else|zmodyfikowany przez/
const POOL_PUBLIC = {
  description: 'Nauka pływania dla dzieci od 6 lat, w grupach według umiejętności.',
  conditions: 'Strój kąpielowy, czepek, podpisana deklaracja.',
  contactName: 'Koordynator basenu',
  contactEmail: 'basen@example.org',
  contactPhone: '+48 600 100 200',
}

type StoredSettings = { shortName: string | null; ownAccountMinAge: number; publicSlug: string | null }
type StoredPlace = {
  id: string
  name: string | null
  kind: string | null
  parentPlaceId: string | null
  ownerInstitutionId: string | null
  isExternal: boolean
}
type StoredInstitution = { id: string; name: string | null; type: string | null }

/** The text input of a `CrudForm` field (its labels are not bound to the inputs; lesson `integration-fixture-…`). */
function crudInput(scope: Page | Locator, field: string): Locator {
  return scope.locator(`[data-crud-field-id="${field}"] input`)
}

async function checkCrudBox(scope: Page | Locator, field: string): Promise<void> {
  const box = scope
    .locator(
      `[data-crud-field-id="${field}"] button[role="checkbox"], [data-crud-field-id="${field}"] input[type="checkbox"]`,
    )
    .first()
  await box.click()
  await expect(box).toBeChecked()
}

async function chooseCrudOption(page: Page, field: string, option: RegExp): Promise<void> {
  await page.locator(`[data-crud-field-id="${field}"] [role="combobox"]`).click()
  await page.getByRole('option', { name: option }).click()
}

/**
 * Sets a `CrudForm` date field through the platform date picker (a button with a calendar popover, no text input):
 * the month-and-year grid to the year and month, the day, then "Apply". The form moves the focus once it has loaded,
 * which closes a popover opened earlier, so the page settles first and the opening is retried until the grid shows.
 */
async function pickDate(page: Page, field: string, isoDate: string): Promise<void> {
  const [year, month] = isoDate.split('-').map(Number)
  const trigger = page.locator(`[data-crud-field-id="${field}"] button[data-slot="date-picker-trigger"]`)
  const monthAndYear = page.getByRole('button', { name: /open month and year navigation/ })
  const grid = page.getByRole('dialog', { name: 'Select month and year' })
  await page.waitForLoadState('networkidle')
  await expect(async () => {
    if (!(await monthAndYear.isVisible())) await trigger.click()
    await monthAndYear.click({ timeout: 2_000 })
    await expect(grid).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 20_000 })
  const shownYear = grid.getByRole('button', { name: /back to day selection/ })
  for (let shown = Number(await shownYear.textContent()); shown !== year; shown += shown > year ? -1 : 1) {
    await grid.getByRole('button', { name: shown > year ? /previous year/ : /next year/ }).click()
    await expect(shownYear).toHaveText(String(shown > year ? shown - 1 : shown + 1))
  }
  await grid
    .locator('button[aria-pressed]')
    .nth(month - 1)
    .click()
  await page.locator(`[data-day="${isoDate}"]:not([data-outside]) button`).click()
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(trigger).not.toHaveText(/Pick a date/)
}

/** Picks a person in a `LookupSelect` (searched by last name) inside `scope`. */
async function lookupPerson(scope: Locator, lastName: string, fullName: string): Promise<void> {
  await scope.getByPlaceholder(/Search by last name|Szukaj po nazwisku/).fill(lastName)
  await scope.getByRole('option', { name: new RegExp(fullName) }).click()
  await expect(scope.getByRole('option', { name: new RegExp(fullName) })).toHaveAttribute('aria-selected', 'true')
}

async function createPersonThroughForm(
  page: Page,
  person: { firstName: string; lastName: string; birthDate: string },
): Promise<string> {
  await page.goto('/backend/people/persons/create')
  await crudInput(page, 'firstName').fill(person.firstName)
  await crudInput(page, 'lastName').fill(person.lastName)
  await pickDate(page, 'birthDate', person.birthDate)
  await page
    .getByRole('button', { name: /^Create$|^Utwórz$/ })
    .first()
    .click()
  await expect(page).toHaveURL(/\/backend\/people\/persons\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { level: 1, name: `${person.firstName} ${person.lastName}` })).toBeVisible()
  return page.url().split('/').pop() as string
}

async function openAccountTab(page: Page, personId: string): Promise<void> {
  await page.goto(`/backend/people/persons/${personId}`)
  await page.getByRole('tab', { name: /^Account$|^Konto$/ }).click()
}

test('J-001 club structure and a family on a fresh tenant: settings, sections with coordinators, places, institution, family, accounts, guardian sign-in, errors; phase 1 exit gate', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'j-001')
  try {
    page.setDefaultTimeout(30_000)
    const slug = `dev-academy-${uniqueSuffix()}`

    // Setup J-001 does not describe: the two coordinators' person records (Marek with an account for step 5).
    const marek = await createStaff(request, club, {
      firstName: 'Marek',
      lastName: 'Lis',
      birthDate: birthDateTurning(41),
    })
    const ewaId = await createPerson(request, club.adminToken, {
      firstName: 'Ewa',
      lastName: 'Wrona',
      birthDate: birthDateTurning(35),
    })
    // The last-name search behind the person pickers runs on search tokens that are built after the write.
    for (const [lastName, id] of [
      ['Lis', marek.personId],
      ['Wrona', ewaId],
    ] as const) {
      await expect
        .poll(async () => (await persons(request, club.adminToken, `&lastName=${lastName}`)).items.map((p) => p.id))
        .toEqual([id])
    }

    const adminPassword = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    club.adminToken = await getAuthToken(request, club.tenant.email, adminPassword)

    const sectionIds = new Map<string, string>()

    await test.step('step 1: settings, publication, five sections with coordinators, places and the municipality', async () => {
      // `/backend/club/settings`: the short name and the account age threshold 13 (default 16).
      await page.goto('/backend/club/settings')
      await crudInput(page, 'shortName').fill('Dev Academy')
      await crudInput(page, 'ownAccountMinAge').fill('13')
      await page
        .getByRole('button', { name: /^Save settings$|^Zapisz ustawienia$/ })
        .first()
        .click()
      await expect(page.getByText(/Club settings saved|Ustawienia klubu zapisane/).first()).toBeVisible()
      await expect
        .poll(async () => {
          const stored = await call<StoredSettings>(request, 'GET', '/api/club_core/settings', club.adminToken)
          return { shortName: stored.body?.shortName, ownAccountMinAge: stored.body?.ownAccountMinAge }
        })
        .toEqual({ shortName: 'Dev Academy', ownAccountMinAge: 13 })

      // The public slug lives on `/backend/club/publication` (#29), not on the settings page J-001 names. The page is
      // published with the "description" and "contact" blocks and without "terms", for the exit gate below.
      await page.goto('/backend/club/publication')
      const publication = page.locator('form')
      await crudInput(publication, 'publicSlug').fill(slug)
      for (const field of ['enabled', 'block_description_schedule', 'block_contact']) {
        await checkCrudBox(publication, field)
      }
      await page
        .getByRole('button', { name: /Save publication|Zapisz publikację/ })
        .first()
        .click()
      await expect
        .poll(async () => (await getSettings(request, club.adminToken)).publication)
        .toEqual({
          enabled: true,
          blocks: {
            description_schedule: true,
            conditions: false,
            prices: false,
            coaches: false,
            materials: false,
            contact: true,
            places_calendar: false,
            online_requests: false,
          },
        })
      expect((await getSettings(request, club.adminToken)).publicSlug).toBe(slug)

      // `/backend/club/sections`: Dev Academy's five sections (Q-005).
      for (const name of SECTIONS) {
        await page.goto('/backend/club/sections/create')
        await crudInput(page, 'name').fill(name)
        await page
          .getByRole('button', { name: /^Create$|^Utwórz$/ })
          .first()
          .click()
        await expect(page).toHaveURL(/\/backend\/club\/sections$/)
        await expect(page.getByRole('row').filter({ hasText: name })).toBeVisible()
      }
      const created = await list(request, club.adminToken, 'sections')
      expect(created.items.map((item) => item.name).sort()).toEqual([...SECTIONS].sort())
      for (const item of created.items) sectionIds.set(String(item.name), item.id)

      // On the section record: Marek coordinates the academy, Ewa the swimming pool.
      for (const [section, lastName, fullName] of [
        ['Akademia piłkarska', 'Lis', 'Marek Lis'],
        ['Basen', 'Wrona', 'Ewa Wrona'],
      ] as const) {
        await page.goto(`/backend/club/sections/${String(sectionIds.get(section))}/edit`)
        const panel = page.getByRole('region', { name: /^Coordinators$|^Koordynatorzy$/ })
        await expect(panel.getByText(NO_COORDINATOR)).toBeVisible()
        await lookupPerson(panel, lastName, fullName)
        await panel.getByRole('button', { name: /Assign coordinator|Przypisz koordynatora/ }).click()
        await expect(page.getByText(/Coordinator assigned|Koordynator przypisany/).first()).toBeVisible()
        await expect(panel.getByRole('listitem').filter({ hasText: fullName })).toBeVisible()
        await expect(panel.getByText(NO_COORDINATOR)).toHaveCount(0)
      }

      // The list flags the three sections without a coordinator with a warning; the API stores the same.
      await page.goto('/backend/club/sections')
      for (const name of SECTIONS) {
        const row = page.getByRole('row').filter({ hasText: name })
        await expect(row).toHaveCount(1)
        if (name === 'Akademia piłkarska') await expect(row).toContainText('Marek Lis')
        if (name === 'Basen') await expect(row).toContainText('Ewa Wrona')
        if (name === 'Akademia piłkarska' || name === 'Basen')
          await expect(row.getByText(NO_COORDINATOR)).toHaveCount(0)
        else await expect(row.getByText(NO_COORDINATOR)).toBeVisible()
      }
      const flagged = await list(request, club.adminToken, 'sections')
      expect(Object.fromEntries(flagged.items.map((item) => [item.name, item._people?.coordinatorMissing]))).toEqual({
        'Akademia piłkarska': false,
        Basen: false,
        Zumba: true,
        Szachy: true,
        Cheerleader: true,
      })
      expect(
        flagged.items
          .find((item) => item.name === 'Akademia piłkarska')
          ?._people?.coordinators.map((coordinator) => coordinator.personId),
      ).toEqual([marek.personId])
      expect(flagged.items.find((item) => item.name === 'Basen')?._people?.coordinators.map((c) => c.personId)).toEqual(
        [ewaId],
      )
      await expectRoles(request, club, marek.userId, ['vereino_coordinator', 'vereino_member'])

      // `/backend/club/institutions`: the municipality. Created before the places, because the owner is chosen on
      // the place form (the institution has no "owned places" field).
      await page.goto('/backend/club/institutions/create')
      await crudInput(page, 'name').fill('Gmina Testowo')
      await chooseCrudOption(page, 'type', /^Municipality$|^Gmina$/)
      await page
        .getByRole('button', { name: /^Create$|^Utwórz$/ })
        .first()
        .click()
      await expect(page).toHaveURL(/\/backend\/club\/institutions$/)
      await expect(page.getByRole('row').filter({ hasText: 'Gmina Testowo' })).toBeVisible()

      // `/backend/club/places`: the complex "Orlik 2024" owned by the municipality, its three children, a hall and an
      // outdoor pool (`is_external`).
      const places: {
        name: string
        kind: RegExp
        parent?: string
        owner?: string
        external?: boolean
      }[] = [
        { name: 'Orlik 2024', kind: /^Complex$|^Kompleks$/, owner: 'Gmina Testowo' },
        { name: 'Boisko piłkarskie', kind: /^Pitch$|^Boisko$/, parent: 'Orlik 2024' },
        { name: 'Boisko wielofunkcyjne', kind: /^Multi-purpose pitch$|^Boisko wielofunkcyjne$/, parent: 'Orlik 2024' },
        { name: 'Zaplecze szatniowe', kind: /^Locker room$|^Szatnia$/, parent: 'Orlik 2024' },
        { name: 'Hala sportowa', kind: /^Hall$|^Hala$/ },
        { name: 'Basen odkryty', kind: /^Pool$|^Basen$/, external: true },
      ]
      for (const place of places) {
        await page.goto('/backend/club/places/create')
        await crudInput(page, 'name').fill(place.name)
        await chooseCrudOption(page, 'kind', place.kind)
        if (place.parent) await chooseCrudOption(page, 'parentPlaceId', new RegExp(`^${place.parent}$`))
        if (place.owner) await chooseCrudOption(page, 'ownerInstitutionId', new RegExp(`^${place.owner}$`))
        if (place.external) await checkCrudBox(page, 'isExternal')
        await page
          .getByRole('button', { name: /^Create$|^Utwórz$/ })
          .first()
          .click()
        await expect(page).toHaveURL(/\/backend\/club\/places$/)
        await expect(page.getByRole('row').filter({ hasText: place.name }).first()).toBeVisible()
      }
      const institutions = await call<{ items?: StoredInstitution[] }>(
        request,
        'GET',
        '/api/club_core/institutions?pageSize=100',
        club.adminToken,
      )
      expect(institutions.body?.items?.map((item) => [item.name, item.type])).toEqual([
        ['Gmina Testowo', 'municipality'],
      ])
      const municipalityId = String(institutions.body?.items?.[0]?.id)
      const storedPlaces = await call<{ items?: StoredPlace[] }>(
        request,
        'GET',
        '/api/club_core/places?pageSize=100',
        club.adminToken,
      )
      const byName = new Map((storedPlaces.body?.items ?? []).map((item) => [item.name, item]))
      const orlikId = byName.get('Orlik 2024')?.id
      expect(
        Object.fromEntries(
          [...byName.values()].map((item) => [
            item.name,
            {
              kind: item.kind,
              underOrlik: item.parentPlaceId !== null && item.parentPlaceId === orlikId,
              topLevel: item.parentPlaceId === null,
              ownedByMunicipality: item.ownerInstitutionId === municipalityId,
              isExternal: item.isExternal,
            },
          ]),
        ),
      ).toEqual({
        'Orlik 2024': {
          kind: 'complex',
          underOrlik: false,
          topLevel: true,
          ownedByMunicipality: true,
          isExternal: false,
        },
        'Boisko piłkarskie': {
          kind: 'pitch',
          underOrlik: true,
          topLevel: false,
          ownedByMunicipality: false,
          isExternal: false,
        },
        'Boisko wielofunkcyjne': {
          kind: 'multi_pitch',
          underOrlik: true,
          topLevel: false,
          ownedByMunicipality: false,
          isExternal: false,
        },
        'Zaplecze szatniowe': {
          kind: 'locker_room',
          underOrlik: true,
          topLevel: false,
          ownedByMunicipality: false,
          isExternal: false,
        },
        'Hala sportowa': {
          kind: 'hall',
          underOrlik: false,
          topLevel: true,
          ownedByMunicipality: false,
          isExternal: false,
        },
        'Basen odkryty': {
          kind: 'pool',
          underOrlik: false,
          topLevel: true,
          ownedByMunicipality: false,
          isExternal: true,
        },
      })

      // For the exit gate: the swimming pool's public page with a description, terms and a contact (#29 panel).
      await page.goto(`/backend/club/sections/${String(sectionIds.get('Basen'))}/edit`)
      const publicPanel = page.getByTestId('section-public-panel')
      await checkCrudBox(publicPanel, 'isPublic')
      await crudInput(publicPanel, 'publicSlug').fill('basen')
      await publicPanel.locator('[data-crud-field-id="publicDescription"] textarea').fill(POOL_PUBLIC.description)
      await publicPanel.locator('[data-crud-field-id="publicConditions"] textarea').fill(POOL_PUBLIC.conditions)
      await crudInput(publicPanel, 'publicContactName').fill(POOL_PUBLIC.contactName)
      await crudInput(publicPanel, 'publicContactEmail').fill(POOL_PUBLIC.contactEmail)
      await crudInput(publicPanel, 'publicContactPhone').fill(POOL_PUBLIC.contactPhone)
      await publicPanel
        .getByRole('button', { name: /Save public page|Zapisz stronę publiczną/ })
        .first()
        .click()
      await expect(page.getByTestId('section-public-link')).toBeVisible()
    })

    const family = {
      kasia: { firstName: 'Kasia', lastName: FAMILY_NAME, birthDate: birthDateTurning(38, -30), id: '' },
      jas: { firstName: 'Jaś', lastName: FAMILY_NAME, birthDate: birthDateTurning(9, -30), id: '' },
      ola: { firstName: 'Ola', lastName: FAMILY_NAME, birthDate: birthDateTurning(14, -30), id: '' },
    }

    await test.step('step 2: Kasia, Jaś (9) and Ola (14) created; guardianship with primary payer and consents', async () => {
      for (const person of Object.values(family)) person.id = await createPersonThroughForm(page, person)
      for (const person of Object.values(family)) {
        expect((await getPerson(request, club.adminToken, person.id)).body).toMatchObject({
          firstName: person.firstName,
          lastName: person.lastName,
          birthDate: person.birthDate,
        })
      }
      await expect
        .poll(async () => (await persons(request, club.adminToken, `&lastName=${FAMILY_NAME}`)).items.length)
        .toBe(3)

      // On Kasia's record, in the "Guardianship and consents" tab: the two children, primary payer, consents.
      await page.goto(`/backend/people/persons/${family.kasia.id}`)
      await page.getByRole('tab', { name: /Guardianship|Opieka/ }).click()
      const link = page.getByRole('form', { name: /Link a person|Powiąż osobę/ })
      for (const [ward, consents] of [
        [family.jas, [/Club regulations|Regulamin klubu/, /Image|Wizerunek/]],
        [family.ola, [/Club regulations|Regulamin klubu/]],
      ] as const) {
        await lookupPerson(link, FAMILY_NAME, `${ward.firstName} ${ward.lastName}`)
        for (const name of [/Primary payer|Główny płatnik/, ...consents]) {
          const box = link.getByRole('checkbox', { name })
          await box.click()
          await expect(box).toBeChecked()
        }
        await link.getByRole('button', { name: /Add guardianship|Dodaj opiekę/ }).click()
        await expect(page.getByText(/guardianship has been added|Opieka została dodana/).first()).toBeVisible()
        await expect(page.getByRole('link', { name: `${ward.firstName} ${ward.lastName}` })).toBeVisible()
      }

      const stored = await guardianships(request, club.adminToken, `personId=${family.kasia.id}`)
      expect(stored.status).toBe(200)
      const byWard = new Map(stored.items.map((item) => [item.wardPersonId, item]))
      expect(stored.items).toHaveLength(2)
      for (const [ward, image] of [
        [family.jas, true],
        [family.ola, false],
      ] as const) {
        expect(byWard.get(ward.id)).toMatchObject({
          guardianPersonId: family.kasia.id,
          relation: 'parent',
          isPrimaryPayer: true,
          validTo: null,
          consents: {
            regulations: { granted: true },
            image: { granted: image },
            trips: { granted: false },
          },
        })
      }
    })

    const kasiaEmail = `kasia-${uniqueSuffix()}@example.org`
    const olaEmail = `ola-${uniqueSuffix()}@example.org`
    let kasiaUserId = ''
    let olaUserId = ''

    await test.step('step 3: "Create account" for Kasia (member and payer, invitation), disabled for Jaś (13), Ola without payer', async () => {
      const createAccountThroughTab = async (personId: string, email: string): Promise<string> => {
        await openAccountTab(page, personId)
        await page.getByLabel(/E-mail for the invitation|E-mail do zaproszenia/).fill(email)
        await page.getByRole('button', { name: /Create account|Utwórz konto/ }).click()
        await expect(
          page.getByText(/account has been created and the invitation sent|Konto zostało utworzone/).first(),
        ).toBeVisible()
        await expect(page.getByText(/This person has an account|Ta osoba ma konto/)).toBeVisible()
        const userId = (await getPerson(request, club.adminToken, personId)).body?.userId
        expect(typeof userId).toBe('string')
        club.extraUserIds.push(String(userId))
        return String(userId)
      }

      kasiaUserId = await createAccountThroughTab(family.kasia.id, kasiaEmail)
      await expectRoles(request, club, kasiaUserId, ['vereino_member', 'vereino_payer'])
      await expect.poll(() => capturedEmails(kasiaEmail).length).toBeGreaterThan(0)
      expect(capturedEmails(kasiaEmail)[0]?.links.some((href) => href.includes('/reset/'))).toBe(true)

      // Jaś (9) is below the club's threshold of 13: the button is disabled with the explanation.
      await openAccountTab(page, family.jas.id)
      await expect(
        page.getByText(/Below the account age threshold \(13\)|Poniżej progu wieku dla konta \(13\)/),
      ).toBeVisible()
      await expect(page.getByRole('button', { name: /Create account|Utwórz konto/ })).toBeDisabled()
      expect((await getPerson(request, club.adminToken, family.jas.id)).body).toMatchObject({ hasAccount: false })

      // Ola (14) gets an account with the member role only: no payer, so no payments.
      olaUserId = await createAccountThroughTab(family.ola.id, olaEmail)
      await expectRoles(request, club, olaUserId, ['vereino_member'])
    })

    await test.step('step 4: Kasia sets a password, signs in, lands on /club and sees both children with their consents', async () => {
      await page.context().clearCookies()
      const invitation = capturedEmails(kasiaEmail).at(-1)
      const resetLink = invitation?.links.find((href) => href.includes('/reset/'))
      expect(resetLink, JSON.stringify(invitation)).toBeTruthy()
      const password = `Vereino-${uniqueSuffix()}-Aa1!`
      await page.goto(new URL(String(resetLink)).pathname)
      const resetForm = page.locator('form[data-auth-ready="1"]')
      await resetForm.locator('input[name="password"]').fill(password)
      await resetForm.locator('input[name="confirmPassword"]').fill(password)
      await resetForm.locator('button[type="submit"]').click()
      await page.waitForURL((url) => !url.pathname.startsWith('/reset'))

      await signInThroughForm(page, kasiaEmail, password)
      await expect(page).toHaveURL(/\/club$/)
      await expect(page.getByRole('heading', { level: 1, name: /Hello, Kasia|Cześć, Kasia/ })).toBeVisible()
      const wards = page.getByTestId('club-ward')
      await expect(wards).toHaveCount(2)
      await expect(wards.filter({ hasText: 'Jaś Nowak' })).toContainText(/Consents: 2 of 3|Zgody: 2 z 3/)
      await expect(wards.filter({ hasText: 'Ola Nowak' })).toContainText(/Consents: 1 of 3|Zgody: 1 z 3/)

      const token = await getAuthToken(request, kasiaEmail, password)
      const me = await getMe(request, token)
      expect(me.status, JSON.stringify(me.body)).toBe(200)
      expect(me.body?.person.id).toBe(family.kasia.id)
      // `paymentsVisible` is not asserted for Kasia: the `payments` module is not enabled before phase 4, so the
      // platform grants its features to nobody (lesson `future-module-gates-and-auth-login-interceptors`); her
      // `vereino_payer` role (step 3) is what phase 1 stores.
      expect(
        me.body?.wards.map((ward) => [
          ward.firstName,
          ward.guardianship.isPrimaryPayer,
          ward.guardianship.consents.regulations.granted,
          ward.guardianship.consents.image.granted,
        ]),
      ).toEqual([
        ['Jaś', true, true, true],
        ['Ola', true, true, false],
      ])

      // Jaś's profile with his consents.
      await wards.filter({ hasText: 'Jaś Nowak' }).click()
      await expect(page).toHaveURL(new RegExp(`/club/wards/${family.jas.id}$`))
      await expect(page.getByText(/You are the primary payer|Jesteś głównym płatnikiem/)).toBeVisible()
      await expect(page.getByRole('switch', { name: /Image|Wizerunek/ })).toBeChecked()
      await expect(page.getByRole('switch', { name: /Trips|Wyjazdy/ })).not.toBeChecked()
    })

    await test.step('exit gate: /club in light and dark mode at 375 px', async () => {
      await prepareForAccessibilityScan(page)
      await page.setViewportSize({ width: 375, height: 812 })
      await page.goto('/club')
      const violations = await scanInColorSchemes(
        page,
        testInfo,
        '/club',
        () => expect(page.getByTestId('club-ward')).toHaveCount(2),
        { platformBaseline: true },
      )
      await expectNoPageOverflow(page)
      expect(violations).toEqual({})
      await page.setViewportSize({ width: 1280, height: 720 })
      await page.emulateMedia({ colorScheme: 'light' })
    })

    await test.step('step 4: Ola signs in and sees no payments', async () => {
      const password = await acceptInvitation(request, olaEmail)
      await page.context().clearCookies()
      await signInThroughForm(page, olaEmail, password)
      await expect(page).toHaveURL(/\/club$/)
      await expect(page.getByRole('heading', { level: 1, name: /Hello, Ola|Cześć, Ola/ })).toBeVisible()
      await expect(page.getByTestId('club-tile-profile')).toBeVisible()
      await expect(page.getByTestId('club-wards')).toHaveCount(0)
      await expect(page.getByText(/Payments|Płatności/)).toHaveCount(0)
      expect((await page.goto('/club/payments'))?.status()).toBe(404)
      const me = await getMe(request, await getAuthToken(request, olaEmail, password))
      expect(me.body?.person.id).toBe(family.ola.id)
      expect(me.body?.wards).toEqual([])
      expect(me.body?.paymentsVisible).toBe(false)
      // The R10 gate the phase 4 payments routes call refuses her for her age, before any feature is checked.
      expect(checkOwnPayments(club, olaUserId)).toEqual({ allowed: false, status: 403, code: 'payments_minor' })
    })

    await test.step('step 5: an e-mail already in use answers 409; a stale person record answers 409 with the conflict notice', async () => {
      await page.context().clearCookies()
      const password = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
      club.adminToken = await getAuthToken(request, club.tenant.email, password)

      // Ewa's account with Kasia's address: 409 `email_taken`, shown to the administrator; no account is created.
      await openAccountTab(page, ewaId)
      await page.getByLabel(/E-mail for the invitation|E-mail do zaproszenia/).fill(kasiaEmail)
      const [answer] = await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().endsWith(`/api/people/persons/${ewaId}/account`) && response.request().method() === 'POST',
        ),
        page.getByRole('button', { name: /Create account|Utwórz konto/ }).click(),
      ])
      expect(answer.status()).toBe(409)
      expect(((await answer.json()) as { code?: string }).code).toBe('email_taken')
      await expect(
        page.getByText(/already used by another account|jest już używany przez inne konto/).first(),
      ).toBeVisible()
      expect((await getPerson(request, club.adminToken, ewaId)).body).toMatchObject({ hasAccount: false })

      // Kasia's record changes elsewhere while the form is open: saving shows the shared conflict notice.
      await page.goto(`/backend/people/persons/${family.kasia.id}`)
      await expect(crudInput(page, 'firstName')).toHaveValue('Kasia')
      const before = (await getPerson(request, club.adminToken, family.kasia.id)).body as { updatedAt?: string }
      const elsewhere = await call(request, 'PUT', '/api/people/persons', club.adminToken, {
        data: { id: family.kasia.id, phone: '+48 500 100 200' },
        headers: { [OPTIMISTIC_LOCK_HEADER]: String(before.updatedAt) },
      })
      expect(elsewhere.status, JSON.stringify(elsewhere.body)).toBe(200)
      const [save] = await Promise.all([
        page.waitForResponse(
          (response) => response.url().includes('/api/people/persons') && response.request().method() === 'PUT',
        ),
        (async () => {
          await crudInput(page, 'firstName').fill('Katarzyna')
          await page
            .getByRole('button', { name: /^Save$|^Zapisz$/ })
            .first()
            .click()
        })(),
      ])
      expect(save.status()).toBe(409)
      await expect(page.getByText(CONFLICT).first()).toBeVisible()
      expect((await getPerson(request, club.adminToken, family.kasia.id)).body).toMatchObject({
        firstName: 'Kasia',
        phone: '+48 500 100 200',
      })
    })

    await test.step('exit gate: /backend/club/sections and /backend/people/persons/[id] in light and dark mode at 375 px', async () => {
      await prepareForAccessibilityScan(page)
      await page.setViewportSize({ width: 375, height: 812 })
      const violations: Record<string, unknown> = {}
      await page.goto('/backend/club/sections')
      Object.assign(
        violations,
        await scanInColorSchemes(
          page,
          testInfo,
          '/backend/club/sections',
          () => expect(page.getByRole('row').filter({ hasText: 'Cheerleader' })).toBeVisible(),
          { platformBaseline: true },
        ),
      )
      await expectNoPageOverflow(page)
      await page.setViewportSize({ width: 375, height: 812 })
      await page.goto(`/backend/people/persons/${family.kasia.id}`)
      Object.assign(
        violations,
        await scanInColorSchemes(
          page,
          testInfo,
          '/backend/people/persons/[id]',
          () => expect(page.getByRole('heading', { level: 1, name: 'Kasia Nowak' })).toBeVisible(),
          { platformBaseline: true },
        ),
      )
      await expectNoPageOverflow(page)
      expect(violations).toEqual({})
      await page.setViewportSize({ width: 1280, height: 720 })
      await page.emulateMedia({ colorScheme: 'light' })
    })

    await test.step('step 5 and exit gate: a user without people.manage sees "Access denied"', async () => {
      // Marek (coordinator) reads the people list (`people.view`) but may not add a person (`people.manage`).
      await page.context().clearCookies()
      const password = await signInBrowser(page, request, club, marek.userId, marek.email)
      await page.goto('/backend/people/persons')
      await expect(page.getByRole('heading', { level: 1, name: /^People$|^Osoby$/ })).toBeVisible()
      await expect(page.getByText(ACCESS_DENIED)).toHaveCount(0)
      await page.goto('/backend/people/persons/create')
      await expect(page.getByText(ACCESS_DENIED).first()).toBeVisible()
      await expect(page.locator('[data-crud-field-id="firstName"]')).toHaveCount(0)
      const marekToken = await getAuthToken(request, marek.email, password)
      const refused = await call(request, 'POST', '/api/people/persons', marekToken, {
        data: { firstName: 'Nieuprawniony', lastName: FAMILY_NAME },
      })
      expect(refused.status).toBe(403)
      expect((await persons(request, club.adminToken, `&lastName=${FAMILY_NAME}`)).items).toHaveLength(3)
    })

    await test.step('exit gate: /p/[clubSlug] in light and dark mode at 375 px; the section page shows only the enabled blocks', async () => {
      await page.context().clearCookies()
      await prepareForAccessibilityScan(page)
      await page.setViewportSize({ width: 375, height: 812 })
      const violations: Record<string, unknown> = {}

      await page.goto(`/p/${slug}`)
      await expect(page.getByTestId('public-club-name')).toHaveText('Dev Academy')
      await expect(page.getByTestId('public-section-basen')).toBeVisible()
      Object.assign(
        violations,
        await scanInColorSchemes(page, testInfo, '/p/[clubSlug]', () =>
          expect(page.getByTestId('public-club-name')).toBeVisible(),
        ),
      )
      await expectNoPageOverflow(page)
      await page.setViewportSize({ width: 375, height: 812 })

      // The section has a description, terms and a contact; the club publishes "description" and "contact" only.
      await page.goto(`/p/${slug}/sections/basen`)
      await expect(page.getByTestId('public-section-name')).toHaveText('Basen')
      await expect(page.getByTestId('public-block-description')).toContainText(POOL_PUBLIC.description)
      await expect(page.getByTestId('public-block-contact')).toContainText(POOL_PUBLIC.contactEmail)
      await expect(page.getByTestId('public-block-conditions')).toHaveCount(0)
      await expect(page.getByText(POOL_PUBLIC.conditions)).toHaveCount(0)
      await expect(page.getByTestId('public-block-materials')).toHaveCount(0)
      Object.assign(
        violations,
        await scanInColorSchemes(page, testInfo, '/p/[clubSlug]/sections/[sectionSlug]', () =>
          expect(page.getByTestId('public-section-name')).toBeVisible(),
        ),
      )
      await expectNoPageOverflow(page)
      expect(violations).toEqual({})

      const sectionPage = await publicGet(request, `/api/club_core/public/${slug}/sections/basen`)
      expect(sectionPage.status).toBe(200)
      const blocks = (sectionPage.body as unknown as PublicSectionPage).blocks
      expect(Object.keys(blocks).sort()).toEqual(['contact', 'description'])
      expect(blocks.description).toEqual({ text: POOL_PUBLIC.description })
      expect(JSON.stringify(sectionPage.body)).not.toContain(POOL_PUBLIC.conditions)
    })
  } finally {
    await club.cleanup()
  }
})
