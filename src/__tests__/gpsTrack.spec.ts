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

describe('SavedTracksPanel highlighting', () => {
  it('assigns unique track-card id and applies is-highlighted class', async () => {
    const { mount } = await import('@vue/test-utils')
    const SavedTracksPanel = (await import('../components/SavedTracksPanel.vue')).default
    const store = useGpsTrackStore()

    const points: TrackPoint[] = [
      { lat: 60.3913, lng: 5.3221, timestamp: 1725450000000 }
    ]
    const saved = store.saveTrack(points, 'Høydetur')
    expect(saved).not.toBeNull()

    const wrapper = mount(SavedTracksPanel, {
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
})
