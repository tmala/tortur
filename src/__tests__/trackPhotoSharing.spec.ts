import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import TrackPlaybackPanel from '@/components/TrackPlaybackPanel.vue'
import TrackPhotosSection from '@/components/TrackPhotosSection.vue'
import { useGpsTrackStore, type SavedTrack } from '@/stores/gpsTrack'
import { useFirebaseTracks } from '@/composables/useFirebaseTracks'
import { useAuth } from '@/composables/useAuth'

describe('Track Photo Sharing with Friends', () => {
  let fetchSpy: MockInstance

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    sessionStorage.clear()
    vi.clearAllMocks()

    const { systemConfig } = useAuth()
    systemConfig.value = {
      FIREBASE_DB_URL: 'https://test-db.firebaseio.com',
      FIREBASE_SECRET_PREFIX: 'test_prefix'
    }

    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((url: RequestInfo | URL, opts?: RequestInit) => {
      const urlStr = String(url)
      if (urlStr.includes('/tracks.json')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            '2026-09-15T12-00-00-000Z': {
              id: 'track_1',
              name: 'Veten på Varaldsøy',
              startTime: 1726401600000,
              createdAt: 1726401600000,
              sharePhotosWithFriends: true,
              visibility: 'friends',
              points: [{ lat: 60.1, lng: 5.2, timestamp: 1726401600000 }]
            },
            '2026-09-16T12-00-00-000Z': {
              id: 'track_2',
              name: 'Hemmelig privat tur',
              startTime: 1726488000000,
              createdAt: 1726488000000,
              visibility: 'private',
              points: [{ lat: 60.2, lng: 5.3, timestamp: 1726488000000 }]
            },
            '2026-09-17T12-00-00-000Z': {
              id: 'track_3',
              name: 'Offentlig tur for alle',
              startTime: 1726574400000,
              createdAt: 1726574400000,
              visibility: 'all',
              points: [{ lat: 60.3, lng: 5.4, timestamp: 1726574400000 }]
            }
          })
        } as unknown as Response)
      }

      if (urlStr.includes('/tracks/') && opts?.method === 'PATCH') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true })
        } as unknown as Response)
      }

      if (urlStr.includes('/track_photos/')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({})
        } as unknown as Response)
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({})
      } as unknown as Response)
    })
  })

  afterEach(() => {
    fetchSpy.mockRestore()
    localStorage.clear()
    document.body.innerHTML = ''
  })

  describe('useFirebaseTracks', () => {
    it('parser sharePhotosWithFriends og visibility riktig fra Firebase', async () => {
      const { fetchUserTracksFromFirebase } = useFirebaseTracks()
      const tracks = await fetchUserTracksFromFirebase('user_test_1')

      expect(tracks).toHaveLength(3)
      const t1 = tracks.find(t => t.id === 'track_1')
      const t2 = tracks.find(t => t.id === 'track_2')
      const t3 = tracks.find(t => t.id === 'track_3')

      expect(t1?.sharePhotosWithFriends).toBe(true)
      expect(t1?.visibility).toBe('friends')
      expect(t2?.visibility).toBe('private')
      expect(t3?.visibility).toBe('all')
    })

    it('fetchFriendTracks utelater private spor og returnerer kun venner- og all-spor', async () => {
      const { fetchFriendTracks } = useFirebaseTracks()
      const friendTracks = await fetchFriendTracks('user_test_1')

      expect(friendTracks).toHaveLength(2)
      expect(friendTracks.map(t => t.id)).toEqual(expect.arrayContaining(['track_1', 'track_3']))
      expect(friendTracks.find(t => t.id === 'track_2')).toBeUndefined()
    })

    it('setTrackVisibilityInFirebase sender PATCH med visibility', async () => {
      const { setTrackVisibilityInFirebase } = useFirebaseTracks()
      const mockTrack: SavedTrack = {
        id: 'track_1',
        userId: 'user_test_1',
        name: 'Veten på Varaldsøy',
        createdAt: 1726401600000,
        startTime: 1726401600000,
        endTime: 1726405200000,
        distanceMeters: 2200,
        durationMs: 3600000,
        points: [],
        firebaseKey: '2026-09-15T12-00-00-000Z'
      }

      const ok = await setTrackVisibilityInFirebase('user_test_1', mockTrack, 'friends')
      expect(ok).toBe(true)
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/tracks/2026-09-15T12-00-00-000Z.json'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ visibility: 'friends' })
        })
      )
    })

    it('setTrackPhotoSharingInFirebase sender PATCH med sharePhotosWithFriends', async () => {
      const { setTrackPhotoSharingInFirebase } = useFirebaseTracks()
      const mockTrack: SavedTrack = {
        id: 'track_1',
        userId: 'user_test_1',
        name: 'Veten på Varaldsøy',
        createdAt: 1726401600000,
        startTime: 1726401600000,
        endTime: 1726405200000,
        distanceMeters: 2200,
        durationMs: 3600000,
        points: [],
        firebaseKey: '2026-09-15T12-00-00-000Z'
      }

      const ok = await setTrackPhotoSharingInFirebase('user_test_1', mockTrack, true)
      expect(ok).toBe(true)
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/tracks/2026-09-15T12-00-00-000Z.json'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ sharePhotosWithFriends: true })
        })
      )
    })
  })

  describe('useGpsTrackStore setPhotoSharing', () => {
    it('oppdaterer sharePhotosWithFriends lokalt og kaller Firebase ved innlogget bruker', () => {
      const store = useGpsTrackStore()
      store.setUser('user_test_1')

      const track = store.saveTrack(
        [{ lat: 60.1, lng: 5.2, timestamp: 1726401600000 }],
        'Testtur'
      )
      expect(track).not.toBeNull()
      expect(track?.sharePhotosWithFriends).toBeUndefined()

      const success = store.setPhotoSharing(track!.id, true)
      expect(success).toBe(true)

      const updated = store.savedTracks.find((t) => t.id === track!.id)
      expect(updated?.sharePhotosWithFriends).toBe(true)

      // Skal også være lagret i localStorage
      const stored = localStorage.getItem('tortur_saved_tracks_user_test_1')
      expect(stored).toContain('"sharePhotosWithFriends":true')
    })
  })

  describe('TrackPlaybackPanel photosAvailable prop', () => {
    const mockTrack: SavedTrack = {
      id: 'track_friend',
      userId: 'friend_user_99',
      name: 'Vennens spor',
      createdAt: 1726401600000,
      startTime: 1726401600000,
      endTime: 1726405200000,
      distanceMeters: 3000,
      durationMs: 3600000,
      points: []
    }

    it('viser "Turbilder på kartet"-bryteren når photosAvailable er true', () => {
      const wrapper = mount(TrackPlaybackPanel, {
        props: {
          track: mockTrack,
          isReplaying: false,
          replaySpeed: 40,
          showKmMarkers: true,
          showPhotosOnMap: true,
          onTrackPhotosCount: 0,
          photosAvailable: true
        }
      })

      expect(wrapper.text()).toContain('Turbilder på kartet')
      expect(wrapper.text()).toContain('(Ingen bilder på sporet)')
    })

    it('skjuler "Turbilder på kartet"-bryteren helt når photosAvailable er false', () => {
      const wrapper = mount(TrackPlaybackPanel, {
        props: {
          track: mockTrack,
          isReplaying: false,
          replaySpeed: 40,
          showKmMarkers: true,
          showPhotosOnMap: true,
          onTrackPhotosCount: 0,
          photosAvailable: false
        }
      })

      expect(wrapper.text()).not.toContain('Turbilder på kartet')
      expect(wrapper.text()).not.toContain('(Ingen bilder på sporet)')
      // Kilometer-markører skal fortsatt være synlig
      expect(wrapper.text()).toContain('Kilometer-markører')
    })
  })

  describe('TrackPhotosSection deling med venner bryter', () => {
    it('viser "Del bilder med venner"-bryter og oppdaterer tilstand ved endring', async () => {
      const store = useGpsTrackStore()
      store.setUser('user_test_1')

      const mockTrack: SavedTrack = {
        id: 'track_123',
        userId: 'user_test_1',
        name: 'Min tur',
        createdAt: 1726401600000,
        startTime: 1726401600000,
        endTime: 1726405200000,
        distanceMeters: 2000,
        durationMs: 3600000,
        points: [],
        sharePhotosWithFriends: false
      }
      store.savedTracks = [mockTrack]

      const wrapper = mount(TrackPhotosSection, {
        props: {
          track: mockTrack,
          userId: 'user_test_1'
        }
      })

      // Åpne trekkspillet for turbilder
      await wrapper.find('.btn-photos-accordion').trigger('click')

      expect(wrapper.text()).toContain('Del bilder med venner')
      const shareCheckbox = wrapper.find('input[aria-label="Del turbilder med venner for dette sporet"]')
      expect(shareCheckbox.exists()).toBe(true)
      expect((shareCheckbox.element as HTMLInputElement).checked).toBe(false)

      // Slå på deling
      await shareCheckbox.setValue(true)

      const updated = store.savedTracks.find((t) => t.id === 'track_123')
      expect(updated?.sharePhotosWithFriends).toBe(true)
    })
  })
})
