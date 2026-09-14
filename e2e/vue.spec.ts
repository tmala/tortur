import { test, expect } from '@playwright/test'

/**
 * E2E-tester for ikke-innlogget bruker
 *
 * Ulriken, Bergen: lat=60.3776664, lng=5.3809247
 * Koordinater brukes til å simulere at brukeren befinner seg ved Ulriken.
 */

const ULRIKEN_LAT = 60.3776664
const ULRIKEN_LNG = 5.3809247

test.describe('Ikke-innlogget bruker', () => {
  test.beforeEach(async ({ context }) => {
    // Simuler at brukeren har gitt tillatelse til posisjonering
    // og befinner seg ved Ulriken i Bergen
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: ULRIKEN_LAT, longitude: ULRIKEN_LNG, accuracy: 10 })
  })

  test('appen laster og viser TorTur-merke i headeren', async ({ page }) => {
    await page.goto('/')

    // Vent til appen har lastet – brand-badge-knappen med TorTur-tekst skal være synlig
    const brandBtn = page.locator('button.brand-badge-btn')
    await expect(brandBtn).toBeVisible({ timeout: 10_000 })

    // Appen-tittelen skal inneholde "TorTur"
    const brandTitle = page.locator('.brand-title')
    await expect(brandTitle).toContainText('TorTur')
  })

  test('ikke-innlogget bruker ser "Logg inn"-knapp', async ({ page }) => {
    await page.goto('/')

    // Login-knappen skal vises for en ikke-innlogget bruker
    const loginBtn = page.locator('button.auth-login-btn')
    await expect(loginBtn).toBeVisible({ timeout: 10_000 })
    await expect(loginBtn).toContainText('Logg inn')
  })

  test('kartet rendres med Leaflet-tiles', async ({ page }) => {
    await page.goto('/')

    // Leaflet setter .leaflet-container på kart-elementet
    const map = page.locator('.leaflet-container')
    await expect(map).toBeVisible({ timeout: 15_000 })
  })

  test('kan åpne meny og se Turposter-knappen', async ({ page }) => {
    await page.goto('/')

    // Vent på at appen har lastet
    const brandBtn = page.locator('button.brand-badge-btn')
    await expect(brandBtn).toBeVisible({ timeout: 10_000 })

    // Klikk på merkevare-knappen for å åpne nedtrekksmenyen
    await brandBtn.click()

    // Dropdown vises med en transition – btn-turposter er inni v-if="isOpen"
    const turposterBtn = page.locator('.brand-menu-dropdown button.btn-turposter')
    await expect(turposterBtn).toBeVisible({ timeout: 8_000 })

    // Knappen viser enten "Turposter" (ingen kommune valgt) eller kommunenavn + antall
    // (f.eks. "Bergen (240)") når geolocation har detektert kommunen automatisk.
    // Vi verifiserer kun at knappen eksisterer og er klikkbar – ikke teksten.
    await expect(turposterBtn).toBeEnabled()
  })

  test('kan åpne turposterlisten fra menyen', async ({ page }) => {
    await page.goto('/')

    // Åpne menyen
    const brandBtn = page.locator('button.brand-badge-btn')
    await expect(brandBtn).toBeVisible({ timeout: 10_000 })
    await brandBtn.click()

    // Klikk Turposter-knappen i dropdown
    const turposterBtn = page.locator('.brand-menu-dropdown button.btn-turposter')
    await expect(turposterBtn).toBeVisible({ timeout: 8_000 })
    await turposterBtn.click()

    // TurposterPanel skal åpnes og vise en liste med turposter
    const panel = page.locator('.turposter-panel')
    await expect(panel).toBeVisible({ timeout: 10_000 })

    // Panelet skal inneholde "Turposter i Norge"-tekst
    await expect(panel.locator('h3')).toContainText('Turposter i Norge')
  })

  test('«Vis turposter der jeg er» laster Bergen og panelet viser Bergen ved åpning', async ({ page }) => {
    await page.goto('/')

    // Åpne menyen
    const brandBtn = page.locator('button.brand-badge-btn')
    await expect(brandBtn).toBeVisible({ timeout: 10_000 })
    await brandBtn.click()

    // Klikk «Vis turposter der jeg er» – dette kaller et eksternt geo-API (Kartverket)
    // og laster Bergen-turposter i bakgrunnen. Panelet åpnes IKKE automatisk.
    const localBtn = page.locator('.brand-menu-dropdown button[aria-label="Vis turposter der jeg er"]')
    await expect(localBtn).toBeVisible({ timeout: 5_000 })
    await localBtn.click()

    // Vent til knappen viser Bergen (indikerer at geo-deteksjonen er fullført)
    const turposterBtn = page.locator('.brand-menu-dropdown button.btn-turposter')
    await expect(turposterBtn).toContainText('Bergen', { timeout: 20_000 })

    // Nå åpner vi turposterpanelet ved å klikke Turposter-knappen
    await turposterBtn.click()

    // Panelet åpnes og viser Bergen-turposter
    const panel = page.locator('.turposter-panel')
    await expect(panel).toBeVisible({ timeout: 10_000 })
    await expect(panel).toContainText('Bergen')
  })

  test('innsjekk-knapp er ikke synlig for ikke-innlogget bruker', async ({ page }) => {
    await page.goto('/')

    // Åpne menyen og last Bergen-turposter via «Vis turposter der jeg er»
    const brandBtn = page.locator('button.brand-badge-btn')
    await expect(brandBtn).toBeVisible({ timeout: 10_000 })
    await brandBtn.click()

    const localBtn = page.locator('.brand-menu-dropdown button[aria-label="Vis turposter der jeg er"]')
    await expect(localBtn).toBeVisible({ timeout: 5_000 })
    await localBtn.click()

    // Vent til Bergen er valgt (geo-deteksjon fullført)
    const turposterBtn = page.locator('.brand-menu-dropdown button.btn-turposter')
    await expect(turposterBtn).toContainText('Bergen', { timeout: 20_000 })

    // Åpne panelet
    await turposterBtn.click()
    const panel = page.locator('.turposter-panel')
    await expect(panel).toBeVisible({ timeout: 10_000 })

    // Innsjekkingsknappen (btn-checkin-quick) er i TurpostCheckinsModal,
    // pakket inn i v-if="isLoggedIn && turpost".
    // For en ikke-innlogget bruker skal denne wrapperen IKKE finnes i DOM.
    const checkinWrap = page.locator('.checkin-quick-wrap')
    await expect(checkinWrap).not.toBeAttached()
  })
})
