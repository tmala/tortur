import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useGpsTrackStore } from '../stores/gpsTrack'
import type { TrackPoint } from '../composables/useGeolocation'

describe('useGpsTrackStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
  })

  it('initializes with empty tracks list and guest user', () => {
    const store = useGpsTrackStore()
    expect(store.currentUserId).toBe('guest')
    expect(store.savedTracks).toEqual([])
    expect(store.activeTrackId).toBeNull()
    expect(store.activeTrack).toBeNull()
  })

  it('saves a track and persists it to localStorage', () => {
    const store = useGpsTrackStore()
    const points: TrackPoint[] = [
      { lat: 60.3913, lng: 5.3221, timestamp: 1725450000000 },
      { lat: 60.3920, lng: 5.3230, timestamp: 1725450600000 }
    ]

    const saved = store.saveTrack(points, 'Testtur Ulriken')
    expect(saved).not.toBeNull()
    expect(saved?.name).toBe('Testtur Ulriken')
    expect(saved?.points.length).toBe(2)
    expect(saved?.distanceMeters).toBeGreaterThan(0)
    expect(saved?.durationMs).toBe(600000)
    expect(store.savedTracks.length).toBe(1)

    // Sjekk at sporet ble lagret i localStorage
    const stored = localStorage.getItem('tortur_saved_tracks_guest')
    expect(stored).not.toBeNull()
    const parsed = JSON.parse(stored!)
    expect(parsed[0].name).toBe('Testtur Ulriken')
  })

  it('switches user and isolates saved tracks per user', () => {
    const store = useGpsTrackStore()
    const points: TrackPoint[] = [
      { lat: 60.3913, lng: 5.3221, timestamp: 1725450000000 },
      { lat: 60.3920, lng: 5.3230, timestamp: 1725450600000 }
    ]

    // Gjest lagrer et spor
    store.saveTrack(points, 'Gjestetur')
    expect(store.savedTracks.length).toBe(1)

    // Bytt til innlogget bruker Ola
    store.setUser('user_ola_123')
    expect(store.currentUserId).toBe('user_ola_123')
    expect(store.savedTracks).toEqual([]) // Ola har ingen spor ennå

    // Ola lagrer et spor
    store.saveTrack(points, 'Olas tur')
    expect(store.savedTracks.length).toBe(1)
    expect(store.savedTracks[0]!.name).toBe('Olas tur')

    // Bytt tilbake til gjest
    store.setUser('guest')
    expect(store.savedTracks.length).toBe(1)
    expect(store.savedTracks[0]!.name).toBe('Gjestetur')
  })

  it('renames an existing track', () => {
    const store = useGpsTrackStore()
    const points: TrackPoint[] = [
      { lat: 60.3913, lng: 5.3221, timestamp: 1725450000000 }
    ]

    const saved = store.saveTrack(points, 'Gammelt navn')
    expect(saved).not.toBeNull()

    const ok = store.renameTrack(saved!.id, 'Nytt og bedre navn')
    expect(ok).toBe(true)
    expect(store.savedTracks[0]!.name).toBe('Nytt og bedre navn')
  })

  it('updates track visibility with setTrackVisibility and persists to localStorage', () => {
    const store = useGpsTrackStore()
    const points: TrackPoint[] = [
      { lat: 60.3913, lng: 5.3221, timestamp: 1725450000000 }
    ]

    const saved = store.saveTrack(points, 'Fjelltur', 'private')
    expect(saved).not.toBeNull()
    expect(saved?.visibility).toBe('private')

    const okFriends = store.setTrackVisibility(saved!.id, 'friends')
    expect(okFriends).toBe(true)
    expect(store.savedTracks[0]!.visibility).toBe('friends')

    const stored = localStorage.getItem('tortur_saved_tracks_guest')
    expect(stored).not.toBeNull()
    const parsed = JSON.parse(stored!)
    expect(parsed[0].visibility).toBe('friends')

    store.setTrackVisibility(saved!.id, 'all')
    expect(store.savedTracks[0]!.visibility).toBe('all')
  })

  it('deletes an existing track and clears activeTrack if it was active', () => {
    const store = useGpsTrackStore()
    const points: TrackPoint[] = [
      { lat: 60.3913, lng: 5.3221, timestamp: 1725450000000 }
    ]

    const saved = store.saveTrack(points, 'Tur som skal slettes')
    expect(saved).not.toBeNull()

    store.viewTrackOnMap(saved!.id)
    expect(store.activeTrackId).toBe(saved!.id)
    expect(store.activeTrack?.name).toBe('Tur som skal slettes')

    const ok = store.deleteTrack(saved!.id)
    expect(ok).toBe(true)
    expect(store.savedTracks.length).toBe(0)
    expect(store.activeTrackId).toBeNull()
    expect(store.activeTrack).toBeNull()
  })

  it('toggles track viewing on map with viewTrackOnMap', () => {
    const store = useGpsTrackStore()
    const points: TrackPoint[] = [
      { lat: 60.3913, lng: 5.3221, timestamp: 1725450000000 }
    ]

    const saved = store.saveTrack(points, 'Tur')
    expect(saved).not.toBeNull()

    store.viewTrackOnMap(saved!.id)
    expect(store.activeTrackId).toBe(saved!.id)

    // Klikk en gang til slår den av
    store.viewTrackOnMap(saved!.id)
    expect(store.activeTrackId).toBeNull()
  })

  it('sets createdAt to first point timestamp (startTime) when saving a track', () => {
    const store = useGpsTrackStore()
    const pointTime = Date.parse('2026-09-04T09:27:45Z')
    const points: TrackPoint[] = [
      { lat: 60.462, lng: 5.343, timestamp: pointTime },
      { lat: 60.463, lng: 5.344, timestamp: pointTime + 10000 }
    ]

    const saved = store.saveTrack(points, 'Rollandsoksen')
    expect(saved).not.toBeNull()
    expect(saved?.createdAt).toBe(pointTime)
    expect(saved?.startTime).toBe(pointTime)
    expect(saved?.id).toContain(`track_${pointTime}_`)
  })

  it('normalizes createdAt to startTime if existing track in storage has later createdAt', () => {
    const pointTime = Date.parse('2026-09-04T09:27:45Z')
    const uploadTime = Date.parse('2026-09-14T01:42:21Z')

    const legacyTrack = {
      id: 'track_legacy',
      userId: 'guest',
      name: 'Rollandsoksen',
      createdAt: uploadTime,
      startTime: pointTime,
      endTime: pointTime + 50000,
      points: [{ lat: 60.462, lng: 5.343, timestamp: pointTime }],
      distanceMeters: 100,
      durationMs: 50000,
      firebaseKey: '2026-09-04T09:27:45_000Z'
    }
    localStorage.setItem('tortur_saved_tracks_guest', JSON.stringify([legacyTrack]))

    const store = useGpsTrackStore()
    store.setUser('guest')

    expect(store.savedTracks.length).toBe(1)
    expect(store.savedTracks[0]!.createdAt).toBe(pointTime)

    // Verify localStorage was updated with migrated createdAt
    const stored = JSON.parse(localStorage.getItem('tortur_saved_tracks_guest') || '[]')
    expect(stored[0].createdAt).toBe(pointTime)
  })
})

describe('SavedTracksMenu', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
  })

  it('assigns unique track-card id and applies is-highlighted class', async () => {
    const { mount } = await import('@vue/test-utils')
    const SavedTracksMenu = (await import('../components/SavedTracksMenu.vue')).default
    const store = useGpsTrackStore()

    const points: TrackPoint[] = [
      { lat: 60.3913, lng: 5.3221, timestamp: 1725450000000 }
    ]
    const saved = store.saveTrack(points, 'Høydetur')
    expect(saved).not.toBeNull()

    const wrapper = mount(SavedTracksMenu, {
      props: {
        isOpen: true,
        highlightedTrackId: saved!.id,
      },
      attachTo: document.body
    })

    await wrapper.vm.$nextTick()

    const card = document.querySelector(`#track-card-${saved!.id}`)
    expect(card).not.toBeNull()
    expect(card?.classList.contains('is-highlighted')).toBe(true)

    wrapper.unmount()
  })

  it('renders track cards in compact view by default and expands on click', async () => {
    const { mount } = await import('@vue/test-utils')
    const SavedTracksMenu = (await import('../components/SavedTracksMenu.vue')).default
    const store = useGpsTrackStore()

    const p1: TrackPoint[] = [{ lat: 60.3913, lng: 5.3221, timestamp: 1725450000000 }]
    const p2: TrackPoint[] = [{ lat: 60.4013, lng: 5.3321, timestamp: 1725460000000 }]
    const t1 = store.saveTrack(p1, 'Tur 1')
    const t2 = store.saveTrack(p2, 'Tur 2')

    const wrapper = mount(SavedTracksMenu, {
      props: {
        isOpen: true,
        highlightedTrackId: null
      },
      attachTo: document.body
    })

    await wrapper.vm.$nextTick()

    const getCard1 = () => document.querySelector(`#track-card-${t1!.id}`)
    const getCard2 = () => document.querySelector(`#track-card-${t2!.id}`)

    expect(getCard1()).not.toBeNull()
    expect(getCard2()).not.toBeNull()

    // Som standard er kortene kompakte (ikke ekspandert)
    expect(getCard1()?.classList.contains('is-expanded')).toBe(false)
    expect(getCard2()?.classList.contains('is-expanded')).toBe(false)
    expect(getCard1()?.querySelector('.btn-view-map')).toBeNull()
    expect(getCard2()?.querySelector('.btn-view-map')).toBeNull()

    // Klikk på første spor for å ekspandere det
    const header1 = getCard1()?.querySelector('.track-card-header') as HTMLElement | null
    header1?.click()
    await wrapper.vm.$nextTick()

    expect(getCard1()?.classList.contains('is-expanded')).toBe(true)
    expect(getCard1()?.querySelector('.btn-view-map')).not.toBeNull()
    expect(getCard1()?.querySelector('.btn-download-gpx')).not.toBeNull()
    // Andre spor er fortsatt kollapset
    expect(getCard2()?.classList.contains('is-expanded')).toBe(false)
    expect(getCard2()?.querySelector('.btn-view-map')).toBeNull()

    // Klikk på andre spor – begge skal nå kunne være ekspandert samtidig
    const header2 = getCard2()?.querySelector('.track-card-header') as HTMLElement | null
    header2?.click()
    await wrapper.vm.$nextTick()

    expect(getCard1()?.classList.contains('is-expanded')).toBe(true)
    expect(getCard2()?.classList.contains('is-expanded')).toBe(true)
    expect(getCard1()?.querySelector('.btn-view-map')).not.toBeNull()
    expect(getCard2()?.querySelector('.btn-view-map')).not.toBeNull()

    // Klikk på første spor chevron igjen for å kollapse det
    const expandBtn1 = getCard1()?.querySelector('.btn-icon-expand') as HTMLElement | null
    expandBtn1?.click()
    await wrapper.vm.$nextTick()

    expect(getCard1()?.classList.contains('is-expanded')).toBe(false)
    expect(getCard1()?.querySelector('.btn-view-map')).toBeNull()
    // Andre spor er fortsatt ekspandert
    expect(getCard2()?.classList.contains('is-expanded')).toBe(true)
    expect(getCard2()?.querySelector('.btn-view-map')).not.toBeNull()

    wrapper.unmount()
  })

  it('groups tracks by month and allows expanding and collapsing months', async () => {
    const { mount } = await import('@vue/test-utils')
    const SavedTracksMenu = (await import('../components/SavedTracksMenu.vue')).default
    const store = useGpsTrackStore()

    const octTime = Date.parse('2026-10-12T10:00:00Z')
    const sepTime = Date.parse('2026-09-15T10:00:00Z')

    const pOct: TrackPoint[] = [{ lat: 60.3913, lng: 5.3221, timestamp: octTime }]
    const pSep: TrackPoint[] = [{ lat: 60.4013, lng: 5.3321, timestamp: sepTime }]

    const trackOct = store.saveTrack(pOct, 'Oktober-tur')
    const trackSep = store.saveTrack(pSep, 'September-tur')

    const wrapper = mount(SavedTracksMenu, {
      props: {
        isOpen: true,
        highlightedTrackId: null
      },
      attachTo: document.body
    })

    await wrapper.vm.$nextTick()

    // Sjekk at begge måneds-headere finnes i DOM
    const monthHeaders = Array.from(document.querySelectorAll('.month-group-header')) as HTMLElement[]
    expect(monthHeaders.length).toBe(2)

    const octHeader = monthHeaders.find(h => h.textContent?.includes('Oktober'))
    const sepHeader = monthHeaders.find(h => h.textContent?.includes('September'))
    expect(octHeader).toBeDefined()
    expect(sepHeader).toBeDefined()

    // Nyeste måned (Oktober) er åpen som standard, eldre måned (September) er kollapset
    expect(document.querySelector(`#track-card-${trackOct!.id}`)).not.toBeNull()
    expect(document.querySelector(`#track-card-${trackSep!.id}`)).toBeNull()

    // Klikk på September for å ekspandere September
    sepHeader?.click()
    await wrapper.vm.$nextTick()

    // Nå skal begge være synlige i listen
    expect(document.querySelector(`#track-card-${trackOct!.id}`)).not.toBeNull()
    expect(document.querySelector(`#track-card-${trackSep!.id}`)).not.toBeNull()

    // Klikk på Oktober for å kollapse Oktober
    octHeader?.click()
    await wrapper.vm.$nextTick()

    expect(document.querySelector(`#track-card-${trackOct!.id}`)).toBeNull()
    expect(document.querySelector(`#track-card-${trackSep!.id}`)).not.toBeNull()

    wrapper.unmount()
  })

  it('renders track cards with visibility badge and updates visibility on select', async () => {
    const { mount } = await import('@vue/test-utils')
    const SavedTracksMenu = (await import('../components/SavedTracksMenu.vue')).default
    const store = useGpsTrackStore()

    const points: TrackPoint[] = [
      { lat: 60.3913, lng: 5.3221, timestamp: Date.parse('2026-10-12T10:00:00Z') }
    ]

    const track = store.saveTrack(points, 'Tur med synlighet', 'friends')

    const wrapper = mount(SavedTracksMenu, {
      props: {
        isOpen: true,
        highlightedTrackId: null
      },
      attachTo: document.body
    })

    await wrapper.vm.$nextTick()

    // Sjekk at synlighetsmerke 'Venner' vises
    const visBadge = document.querySelector('.badge-track-vis')
    expect(visBadge).not.toBeNull()
    expect(visBadge?.textContent).toContain('Venner')

    // Ekspander sporkortet
    const header = document.querySelector('.track-card-header') as HTMLElement
    header.click()
    await wrapper.vm.$nextTick()

    // Finn og klikk på 'Alle'-knappen i TrackVisibilitySelector
    const buttons = Array.from(document.querySelectorAll('.vis-pill-btn')) as HTMLButtonElement[]
    const allBtn = buttons.find(b => b.textContent?.includes('Alle'))
    expect(allBtn).toBeDefined()
    allBtn?.click()
    await wrapper.vm.$nextTick()

    expect(store.savedTracks.find(t => t.id === track!.id)?.visibility).toBe('all')
    wrapper.unmount()
  })
})
