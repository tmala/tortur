import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MockInstance } from 'vitest'
import {
  isFileWithinTrackTime,
  formatTrackFolderName,
  isPhotoNearTrack,
  readPhotoExif,
  createThumbnailDataUrl,
  useTrackPhotos,
  type TrackPhoto
} from '../composables/useTrackPhotos'
import type { SavedTrack } from '../stores/gpsTrack'
import { useAuth } from '../composables/useAuth'
import { mount } from '@vue/test-utils'
import TrackPlaybackPanel from '../components/TrackPlaybackPanel.vue'

// Mock exifr
vi.mock('exifr', () => {
  return {
    default: {
      parse: vi.fn().mockImplementation(async (file: File) => {
        if (file.name.includes('with-exif')) {
          return {
            DateTimeOriginal: new Date('2026-09-17T12:30:00Z'),
            latitude: 59.9139,
            longitude: 10.7522
          }
        }
        return undefined
      }),
      gps: vi.fn().mockImplementation(async (file: File) => {
        if (file.name.includes('gps-only')) {
          return {
            latitude: 60.3913,
            longitude: 5.3221
          }
        }
        return undefined
      })
    }
  }
})

describe('useTrackPhotos', () => {
  let fetchSpy: MockInstance

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()

    const { systemConfig } = useAuth()
    systemConfig.value = {
      FIREBASE_DB_URL: 'https://test-db.firebaseio.com',
      FIREBASE_SECRET_PREFIX: 'test_prefix'
    }

    // Mock createImageBitmap og Canvas for kjapp og stabil thumbnail-testing i jsdom
    if (typeof globalThis.createImageBitmap === 'undefined') {
      globalThis.createImageBitmap = vi.fn().mockImplementation(async () => {
        return {
          width: 800,
          height: 600,
          close: vi.fn()
        } as unknown as ImageBitmap
      })
    }

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      return {
        drawImage: vi.fn()
      } as unknown as CanvasRenderingContext2D
    })

    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => {
      return 'data:image/jpeg;base64,mockCanvasThumb100'
    })
  })

  describe('isFileWithinTrackTime', () => {
    const trackStart = new Date('2026-09-17T12:00:00Z').getTime()
    const trackEnd = new Date('2026-09-17T14:00:00Z').getTime()

    it('returnerer true for bilder tatt under selve turen', () => {
      const during = new Date('2026-09-17T13:00:00Z').getTime()
      expect(isFileWithinTrackTime(during, trackStart, trackEnd)).toBe(true)
    })

    it('returnerer true for bilder tatt innenfor buffer (f.eks. 15 min før eller etter)', () => {
      const justBefore = trackStart - 15 * 60 * 1000
      const justAfter = trackEnd + 20 * 60 * 1000
      expect(isFileWithinTrackTime(justBefore, trackStart, trackEnd)).toBe(true)
      expect(isFileWithinTrackTime(justAfter, trackStart, trackEnd)).toBe(true)
    })

    it('returnerer false for bilder tatt lenge før eller etter turen', () => {
      const wayBefore = trackStart - 2 * 3600 * 1000
      const wayAfter = trackEnd + 3 * 3600 * 1000
      expect(isFileWithinTrackTime(wayBefore, trackStart, trackEnd)).toBe(false)
      expect(isFileWithinTrackTime(wayAfter, trackStart, trackEnd)).toBe(false)
    })

    it('håndterer turer uten eksplisitt starttidspunkt uten å kaste feil', () => {
      expect(isFileWithinTrackTime(123456, 0, 0)).toBe(true)
    })
  })

  describe('formatTrackFolderName', () => {
    it('formaterer mappenavn som YYYY.MM.DD Spornavn', () => {
      const track: SavedTrack = {
        id: 'track_1',
        userId: 'user_1',
        name: 'Fløyen',
        createdAt: new Date('2026-09-15T10:00:00Z').getTime(),
        startTime: new Date('2026-09-15T10:00:00Z').getTime(),
        endTime: null,
        distanceMeters: 1000,
        durationMs: 1000,
        points: []
      }
      expect(formatTrackFolderName(track)).toBe('2026.09.15 Fløyen')
    })
  })

  describe('isPhotoNearTrack', () => {
    const points = [
      { lat: 60.3913, lng: 5.3221 },
      { lat: 60.3920, lng: 5.3230 },
      { lat: 60.3930, lng: 5.3240 }
    ]

    it('returnerer true når bildet er innenfor terskelen (300m)', () => {
      const nearPhoto: TrackPhoto = {
        fileId: 'p1',
        url: 'https://example.com/p1',
        filename: 'fløyen.jpg',
        uploadedAt: 1000,
        lat: 60.3914, // ca 15m fra første punkt
        lng: 5.3222
      }
      expect(isPhotoNearTrack(nearPhoto, points, 300)).toBe(true)
    })

    it('returnerer false når bildet er langt unna sporet', () => {
      const farPhoto: TrackPhoto = {
        fileId: 'p2',
        url: 'https://example.com/p2',
        filename: 'oslo.jpg',
        uploadedAt: 1000,
        lat: 59.9139,
        lng: 10.7522
      }
      expect(isPhotoNearTrack(farPhoto, points, 300)).toBe(false)
    })

    it('returnerer false hvis bildet mangler koordinater eller sporet mangler punkter', () => {
      const noGeoPhoto: TrackPhoto = {
        fileId: 'p3',
        url: 'https://example.com/p3',
        filename: 'nogeo.jpg',
        uploadedAt: 1000
      }
      expect(isPhotoNearTrack(noGeoPhoto, points, 300)).toBe(false)
      expect(isPhotoNearTrack({ ...noGeoPhoto, lat: 60.39, lng: 5.32 }, [], 300)).toBe(false)
    })
  })

  describe('readPhotoExif', () => {
    it('leser DateTimeOriginal og koordinater når EXIF finnes', async () => {
      const file = new File(['dummy'], 'photo-with-exif.jpg', { type: 'image/jpeg' })
      const exif = await readPhotoExif(file)

      expect(exif.timestamp).toBe(new Date('2026-09-17T12:30:00Z').getTime())
      expect(exif.lat).toBe(59.9139)
      expect(exif.lng).toBe(10.7522)
    })

    it('håndterer filer uten EXIF på en trygg måte', async () => {
      const file = new File(['dummy'], 'plain-photo.png', { type: 'image/png' })
      const exif = await readPhotoExif(file)

      expect(exif.timestamp).toBeUndefined()
      expect(exif.lat).toBeUndefined()
      expect(exif.lng).toBeUndefined()
    })
  })

  describe('createThumbnailDataUrl', () => {
    it('genererer en data-URL for bilde med standard maks 100x100', async () => {
      const file = new File(['fake-image-bytes'], 'tur.jpg', { type: 'image/jpeg' })
      const thumb = await createThumbnailDataUrl(file)
      expect(thumb).toBe('data:image/jpeg;base64,mockCanvasThumb100')
    })

    it('respekterer egne dimensjoner (f.eks. maxWidth/maxHeight 100)', async () => {
      let capturedWidth = 0
      let capturedHeight = 0

      const drawImageSpy = vi.fn().mockImplementation((_img: CanvasImageSource, _sx: number, _sy: number, sw?: number, sh?: number) => {
        capturedWidth = typeof sw === 'number' ? sw : 0
        capturedHeight = typeof sh === 'number' ? sh : 0
      })

      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
        return {
          drawImage: drawImageSpy
        } as unknown as CanvasRenderingContext2D
      })

      const file = new File(['fake-image-bytes'], 'panoramabilde.jpg', { type: 'image/jpeg' })
      const thumb = await createThumbnailDataUrl(file, 100, 100)
      expect(thumb).toBe('data:image/jpeg;base64,mockCanvasThumb100')
      // 800x600 skalert til maks 100 bredde -> bredde 100, høyde 75
      expect(capturedWidth).toBe(100)
      expect(capturedHeight).toBe(75)
    })

    it('returnerer undefined dersom canvas-kontekst ikke er tilgjengelig', async () => {
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
      const file = new File(['fake'], 'broken.jpg', { type: 'image/jpeg' })
      const thumb = await createThumbnailDataUrl(file)
      expect(thumb).toBeUndefined()
    })
  })

  describe('Google Drive og Firebase operasjoner', () => {
    const mockTrack: SavedTrack = {
      id: 'track_123',
      userId: 'user_456',
      name: 'Fløyen Tur',
      createdAt: new Date('2026-09-17T10:00:00Z').getTime(),
      startTime: new Date('2026-09-17T10:00:00Z').getTime(),
      endTime: new Date('2026-09-17T12:00:00Z').getTime(),
      distanceMeters: 4500,
      durationMs: 7200000,
      points: [],
      firebaseKey: '2026-09-17T10:00:00_000Z'
    }

    it('getOrCreateTorturFolder returnerer cachet folder ID hvis gyldig', async () => {
      localStorage.setItem('tortur_drive_folder_id', 'cached_folder_999')

      fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
        const urlStr = String(url)
        if (urlStr.includes('/cached_folder_999')) {
          return {
            ok: true,
            json: async () => ({ id: 'cached_folder_999', trashed: false })
          } as unknown as Response
        }
        return { ok: false } as unknown as Response
      })

      const { getOrCreateTorturFolder } = useTrackPhotos()
      const folderId = await getOrCreateTorturFolder('mock_token')

      expect(folderId).toBe('cached_folder_999')
    })

    it('getOrCreateTorturFolder oppretter ny mappe hvis ingen eksisterer', async () => {
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL, opts?: RequestInit) => {
        const urlStr = String(url)
        if (urlStr.includes('/files?') && urlStr.includes('name%3D')) {
          // Søk etter TorTur-mappe -> returner tom liste
          return {
            ok: true,
            json: async () => ({ files: [] })
          } as unknown as Response
        }
        if (urlStr.endsWith('/files') && opts?.method === 'POST') {
          // Opprett ny mappe
          return {
            ok: true,
            json: async () => ({ id: 'new_tortur_folder_123' })
          } as unknown as Response
        }
        return { ok: false } as unknown as Response
      })

      const { getOrCreateTorturFolder } = useTrackPhotos()
      const folderId = await getOrCreateTorturFolder('mock_token')

      expect(folderId).toBe('new_tortur_folder_123')
      expect(localStorage.getItem('tortur_drive_folder_id')).toBe('new_tortur_folder_123')
    })

    it('getOrCreateTrackFolder oppretter undermappe under TorTur med korrekt tittel og forelder', async () => {
      let createdPayload: { name?: string; parents?: string[] } | null = null

      fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL, opts?: RequestInit) => {
        const urlStr = String(url)
        if (urlStr.includes('/files?') && urlStr.includes('parents')) {
          return {
            ok: true,
            json: async () => ({ files: [] })
          } as unknown as Response
        }
        if (urlStr.endsWith('/files') && opts?.method === 'POST') {
          createdPayload = JSON.parse(opts.body as string)
          return {
            ok: true,
            json: async () => ({ id: 'new_track_subfolder_456' })
          } as unknown as Response
        }
        return { ok: false } as unknown as Response
      })

      const { getOrCreateTrackFolder } = useTrackPhotos()
      const folderId = await getOrCreateTrackFolder('tortur_root_id', mockTrack, 'fake_token')

      expect(folderId).toBe('new_track_subfolder_456')
      const payload = createdPayload as { name?: string; parents?: string[] } | null
      expect(payload?.name).toBe('2026.09.17 Fløyen Tur')
      expect(payload?.parents).toEqual(['tortur_root_id'])
    })

    it('uploadFileToDrive sender multipart-opplasting til Drive v3 API', async () => {
      let capturedBody: BodyInit | null | undefined = null
      let capturedHeaders: HeadersInit | undefined = undefined

      fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL, opts?: RequestInit) => {
        const urlStr = String(url)
        if (urlStr.includes('uploadType=multipart')) {
          capturedBody = opts?.body
          capturedHeaders = opts?.headers
          return {
            ok: true,
            json: async () => ({ id: 'drive_file_abc', webViewLink: 'https://drive.google.com/file/d/drive_file_abc/view' })
          } as unknown as Response
        }
        return { ok: false } as unknown as Response
      })

      const { uploadFileToDrive } = useTrackPhotos()
      const dummyFile = new File(['bytes'], 'utsikt.jpg', { type: 'image/jpeg' })
      const result = await uploadFileToDrive(dummyFile, 'folder_123', 'fake_access_token')

      expect(result.fileId).toBe('drive_file_abc')
      expect(result.webViewLink).toBe('https://drive.google.com/file/d/drive_file_abc/view')
      expect(capturedBody).toBeInstanceOf(Blob)
      expect(capturedHeaders).toEqual({ Authorization: 'Bearer fake_access_token' })
    })

    it('makeFileAccessible oppretter anyone/reader tillatelse', async () => {
      let capturedPayload: unknown = null

      fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL, opts?: RequestInit) => {
        const urlStr = String(url)
        if (urlStr.includes('/permissions')) {
          capturedPayload = typeof opts?.body === 'string' ? JSON.parse(opts.body) : null
          return {
            ok: true,
            json: async () => ({ id: 'perm_1' })
          } as unknown as Response
        }
        return { ok: false } as unknown as Response
      })

      const { makeFileAccessible } = useTrackPhotos()
      await makeFileAccessible('drive_file_abc', 'fake_token')

      expect(capturedPayload).toEqual({
        role: 'reader',
        type: 'anyone'
      })
    })

    it('savePhotoToFirebase og fetchTrackPhotos lagrer og henter sorterte bilder', async () => {
      const mockDatabase: Record<string, TrackPhoto> = {}

      fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL, opts?: RequestInit) => {
        const urlStr = String(url)
        if (urlStr.includes('/track_photos/')) {
          if (opts?.method === 'POST') {
            const data = JSON.parse(opts.body as string)
            const pushId = '-OpMockPushKey123'
            mockDatabase[pushId] = data
            return {
              ok: true,
              json: async () => ({ name: pushId })
            } as unknown as Response
          }

          if (!opts?.method || opts.method === 'GET') {
            return {
              ok: true,
              json: async () => mockDatabase
            } as unknown as Response
          }
        }
        return { ok: false } as unknown as Response
      })

      const { savePhotoToFirebase, fetchTrackPhotos } = useTrackPhotos()

      const saved = await savePhotoToFirebase('user_456', 'track_iso_key', {
        fileId: 'f1',
        url: 'https://lh3.googleusercontent.com/d/f1',
        thumbnailDataUrl: 'data:image/jpeg;base64,mockCanvasThumb100',
        filename: 'foto1.jpg',
        uploadedAt: 1000,
        exifTimestamp: 500
      })

      expect(saved).toBeDefined()
      expect(saved?.id).toBe('-OpMockPushKey123')
      expect(saved?.thumbnailDataUrl).toBe('data:image/jpeg;base64,mockCanvasThumb100')

      const list = await fetchTrackPhotos('user_456', 'track_iso_key')
      expect(list.length).toBe(1)
      expect(list[0]?.fileId).toBe('f1')
      expect(list[0]?.id).toBe('-OpMockPushKey123')
      expect(list[0]?.thumbnailDataUrl).toBe('data:image/jpeg;base64,mockCanvasThumb100')
    })

    it('uploadSingleTrackPhoto orkestrerer opplasting, EXIF, deling og lagring', async () => {
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL, opts?: RequestInit) => {
        const urlStr = String(url)

        if (urlStr.includes('uploadType=multipart')) {
          return {
            ok: true,
            json: async () => ({ id: 'full_flow_file_id', webViewLink: 'https://drive.google.com/link' })
          } as unknown as Response
        }
        if (urlStr.includes('/permissions')) {
          return {
            ok: true,
            json: async () => ({ id: 'perm_id' })
          } as unknown as Response
        }
        if (urlStr.includes('/track_photos/') && opts?.method === 'POST') {
          return {
            ok: true,
            json: async () => ({ name: 'firebase_push_id' })
          } as unknown as Response
        }

        return { ok: false } as unknown as Response
      })

      const { uploadSingleTrackPhoto } = useTrackPhotos()
      const testFile = new File(['img_bytes'], 'with-exif.jpg', {
        type: 'image/jpeg',
        lastModified: 1726574400000
      })

      const result = await uploadSingleTrackPhoto(
        testFile,
        mockTrack,
        'user_456',
        'folder_123',
        'valid_drive_token'
      )

      expect(result).toBeDefined()
      expect(result?.id).toBe('firebase_push_id')
      expect(result?.fileId).toBe('full_flow_file_id')
      expect(result?.url).toBe('https://lh3.googleusercontent.com/d/full_flow_file_id')
      expect(result?.thumbnailDataUrl).toBe('data:image/jpeg;base64,mockCanvasThumb100')
      expect(result?.lat).toBe(59.9139)
      expect(result?.lng).toBe(10.7522)
    })
  })

  describe('TrackPlaybackPanel component', () => {
    const mockTrack: SavedTrack = {
      id: 'track_test',
      userId: 'user_1',
      name: 'Fløyen Tur',
      createdAt: new Date('2026-09-17T10:00:00Z').getTime(),
      startTime: new Date('2026-09-17T10:00:00Z').getTime(),
      endTime: new Date('2026-09-17T12:30:00Z').getTime(),
      distanceMeters: 8500,
      durationMs: 9000000,
      points: []
    }

    it('viser sporets navn, tidspunkt og avstand på linje 1', () => {
      const wrapper = mount(TrackPlaybackPanel, {
        props: {
          track: mockTrack,
          isReplaying: false,
          replaySpeed: 40,
          showKmMarkers: true,
          showPhotosOnMap: true,
          onTrackPhotosCount: 3
        }
      })

      expect(wrapper.text()).toContain('Fløyen Tur')
      expect(wrapper.text()).toContain('8.5 km')
      expect(wrapper.text()).toContain('17.09.2026')
    })

    it('emitter focus-track og close ved klikk på knapper', async () => {
      const wrapper = mount(TrackPlaybackPanel, {
        props: {
          track: mockTrack,
          isReplaying: false,
          replaySpeed: 40,
          showKmMarkers: true,
          showPhotosOnMap: true,
          onTrackPhotosCount: 3
        }
      })

      await wrapper.find('.btn-focus').trigger('click')
      expect(wrapper.emitted('focus-track')).toHaveLength(1)

      await wrapper.find('.btn-close').trigger('click')
      expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('emitter update:showKmMarkers når bryter endres', async () => {
      const wrapper = mount(TrackPlaybackPanel, {
        props: {
          track: mockTrack,
          isReplaying: false,
          replaySpeed: 40,
          showKmMarkers: true,
          showPhotosOnMap: true,
          onTrackPhotosCount: 3
        }
      })

      const kmCheckbox = wrapper.findAll('input[type="checkbox"]')[0]
      await kmCheckbox?.setValue(false)
      expect(wrapper.emitted('update:showKmMarkers')?.[0]).toEqual([false])
    })

    it('emitter play, pause og stop-replay ved klikk på kontrollene', async () => {
      const wrapper = mount(TrackPlaybackPanel, {
        props: {
          track: mockTrack,
          isReplaying: false,
          replaySpeed: 40,
          showKmMarkers: true,
          showPhotosOnMap: true,
          onTrackPhotosCount: 3
        }
      })

      // Spill av (når ikke allerede avspilles)
      await wrapper.find('.btn-playback-play').trigger('click')
      expect(wrapper.emitted('play')).toHaveLength(1)

      // Sett isReplaying = true
      await wrapper.setProps({ isReplaying: true })

      // Pause
      await wrapper.find('.btn-playback-pause').trigger('click')
      expect(wrapper.emitted('pause')).toHaveLength(1)

      // Stopp (firkant-ikon / stop-replay)
      await wrapper.find('.btn-playback-stop').trigger('click')
      expect(wrapper.emitted('stop-replay')).toHaveLength(1)
    })

    it('stepper-knapper minus og pluss emitter hastighetsjustering', async () => {
      const wrapper = mount(TrackPlaybackPanel, {
        props: {
          track: mockTrack,
          isReplaying: false,
          replaySpeed: 40,
          showKmMarkers: true,
          showPhotosOnMap: true,
          onTrackPhotosCount: 3
        }
      })

      await wrapper.find('.btn-speed-minus').trigger('click')
      expect(wrapper.emitted('decrease-speed')).toHaveLength(1)

      await wrapper.find('.btn-speed-plus').trigger('click')
      expect(wrapper.emitted('increase-speed')).toHaveLength(1)

      await wrapper.find('.speed-value').trigger('click')
      expect(wrapper.emitted('cycle-speed')).toHaveLength(1)
    })

    it('deaktiverer minus ved 10x og pluss ved 160x', async () => {
      const wrapper = mount(TrackPlaybackPanel, {
        props: {
          track: mockTrack,
          isReplaying: false,
          replaySpeed: 10,
          showKmMarkers: true,
          showPhotosOnMap: true,
          onTrackPhotosCount: 3
        }
      })

      expect(wrapper.find('.btn-speed-minus').attributes('disabled')).toBeDefined()
      expect(wrapper.find('.btn-speed-plus').attributes('disabled')).toBeUndefined()
      expect(wrapper.find('.speed-value').text()).toBe('10x')

      await wrapper.setProps({ replaySpeed: 160 })
      expect(wrapper.find('.btn-speed-minus').attributes('disabled')).toBeUndefined()
      expect(wrapper.find('.btn-speed-plus').attributes('disabled')).toBeDefined()
      expect(wrapper.find('.speed-value').text()).toBe('160x')
    })

    it('har et visuelt dra-håndtak og starter drag ved pointerdown', async () => {
      const wrapper = mount(TrackPlaybackPanel, {
        props: {
          track: mockTrack,
          isReplaying: false,
          replaySpeed: 40,
          showKmMarkers: true,
          showPhotosOnMap: true,
          onTrackPhotosCount: 3
        }
      })

      const dragBar = wrapper.find('.panel-drag-bar')
      expect(dragBar.exists()).toBe(true)

      const vm = wrapper.vm as unknown as {
        isDragging: boolean
        dragPosition: { x: number; y: number }
      }

      expect(vm.isDragging).toBe(false)
      expect(vm.dragPosition).toEqual({ x: 0, y: 0 })

      dragBar.element.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 100,
          clientY: 100,
          pointerType: 'mouse'
        })
      )

      expect(vm.isDragging).toBe(true)

      window.dispatchEvent(new Event('pointerup'))
      expect(vm.isDragging).toBe(false)
    })

    it('tilbakestiller posisjon ved resetPosition eller dblclick', async () => {
      const wrapper = mount(TrackPlaybackPanel, {
        props: {
          track: mockTrack,
          isReplaying: false,
          replaySpeed: 40,
          showKmMarkers: true,
          showPhotosOnMap: true,
          onTrackPhotosCount: 3
        }
      })

      const vm = wrapper.vm as unknown as {
        dragPosition: { x: number; y: number }
      }

      vm.dragPosition.x = 150
      vm.dragPosition.y = 80
      await wrapper.vm.$nextTick()
      expect(wrapper.attributes('style')).toContain('translate3d(150px, 80px, 0)')

      await wrapper.find('.panel-drag-bar').trigger('dblclick')
      expect(vm.dragPosition).toEqual({ x: 0, y: 0 })
      expect(wrapper.attributes('style') || '').not.toContain('translate3d')
    })

    it('starter ikke drag ved klikk på knapper i headeren', async () => {
      const wrapper = mount(TrackPlaybackPanel, {
        props: {
          track: mockTrack,
          isReplaying: false,
          replaySpeed: 40,
          showKmMarkers: true,
          showPhotosOnMap: true,
          onTrackPhotosCount: 3
        }
      })

      const vm = wrapper.vm as unknown as { isDragging: boolean }
      const focusBtn = wrapper.find('.btn-focus')

      focusBtn.element.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          button: 0,
          pointerType: 'mouse'
        })
      )

      expect(vm.isDragging).toBe(false)
    })
  })
})
