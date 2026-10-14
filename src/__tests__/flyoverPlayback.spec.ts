import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { useFlyoverPlayback } from '../composables/flyover/useFlyoverPlayback'
import { useFlyoverCamera } from '../composables/flyover/useFlyoverCamera'
import { prepareFlyoverPath, type FlyoverPath } from '../utils/flyoverPath'
import ElevationProfile from '../components/flyover/ElevationProfile.vue'
import TrackPlaybackPanel from '../components/TrackPlaybackPanel.vue'
import type { SavedTrack } from '../stores/gpsTrack'
import type { Map as MapLibreMap } from 'maplibre-gl'

describe('useFlyoverPlayback', () => {
  let samplePath: FlyoverPath

  beforeEach(() => {
    vi.useFakeTimers()
    samplePath = prepareFlyoverPath([
      { lat: 60.1, lng: 5.1, ele: 100 },
      { lat: 60.2, lng: 5.2, ele: 200 }
    ])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starter pauset med 0 progress', () => {
    const { isPlaying, progress, elapsedSeconds, remainingSeconds } = useFlyoverPlayback(() => samplePath)
    expect(isPlaying.value).toBe(false)
    expect(progress.value).toBe(0)
    expect(elapsedSeconds.value).toBe(0)
    expect(remainingSeconds.value).toBe(60)
  })

  it('endrer targetDuration og speed', () => {
    const { targetDurationSeconds, speedMultiplier, setTargetDuration, setSpeed } = useFlyoverPlayback(
      () => samplePath
    )
    setTargetDuration(120)
    expect(targetDurationSeconds.value).toBe(120)

    setSpeed(2.0)
    expect(speedMultiplier.value).toBe(2.0)
  })

  it('seek oppdaterer progress og kaller onFrame', () => {
    const frameCalls: number[] = []
    const { progress, seek } = useFlyoverPlayback(
      () => samplePath,
      (pt) => {
        frameCalls.push(pt.progress)
      }
    )

    seek(0.5)
    expect(progress.value).toBe(0.5)
    expect(frameCalls).toHaveLength(1)
    expect(frameCalls[0]).toBe(0.5)
  })
})

describe('useFlyoverCamera', () => {
  it('håndterer skifte av kameramoduser og oppdaterer map', () => {
    const jumpToCalls: unknown[] = []
    const mockMap = {
      jumpTo: (opts: unknown) => {
        jumpToCalls.push(opts)
      },
      setZoom: vi.fn(),
      setPitch: vi.fn()
    } as unknown as MapLibreMap

    const { cameraMode, setCameraMode, updateCamera } = useFlyoverCamera(() => mockMap)
    expect(cameraMode.value).toBe('follow')

    const mockPt = {
      lat: 60.1,
      lng: 5.1,
      bearing: 90,
      distanceMeters: 50,
      progress: 0.1
    }

    updateCamera(mockPt, 0.1)
    expect(jumpToCalls.length).toBe(1)

    setCameraMode('birdsEye')
    expect(cameraMode.value).toBe('birdsEye')

    updateCamera(mockPt, 0.1)
    expect(jumpToCalls.length).toBe(2)
  })
})

describe('ElevationProfile', () => {
  it('rendrer høydeprofil og emitter seek ved klikk', async () => {
    const samplePath = prepareFlyoverPath([
      { lat: 60.1, lng: 5.1, ele: 100 },
      { lat: 60.2, lng: 5.2, ele: 250 }
    ])

    const wrapper = mount(ElevationProfile, {
      props: {
        path: samplePath,
        progress: 0.2
      }
    })

    expect(wrapper.find('.elevation-profile-container').exists()).toBe(true)
    expect(wrapper.text()).toContain('100m')
    expect(wrapper.text()).toContain('250m')

    const svg = wrapper.find('svg')
    await svg.trigger('click', { clientX: 180 })
    expect(wrapper.emitted('seek')).toBeDefined()
  })
})

describe('TrackPlaybackPanel 3D-film knapp', () => {
  const mockTrack: SavedTrack = {
    id: 'test-track-3d',
    userId: 'user-1',
    name: 'Tur til Rollandsoksen',
    createdAt: 1700000000000,
    points: [
      { lat: 60.1, lng: 5.1, ele: 100, timestamp: 1700000000000 },
      { lat: 60.2, lng: 5.2, ele: 150, timestamp: 1700000060000 }
    ],
    distanceMeters: 1200,
    durationMs: 60000,
    startTime: 1700000000000,
    endTime: 1700000060000
  }

  it('viser 3D-film knapp og emitter play-3d ved klikk', async () => {
    const wrapper = mount(TrackPlaybackPanel, {
      props: {
        track: mockTrack,
        isReplaying: false,
        replaySpeed: 40,
        showKmMarkers: true,
        showPhotosOnMap: true,
        onTrackPhotosCount: 0
      }
    })

    const btn3d = wrapper.find('.btn-playback-3d')
    expect(btn3d.exists()).toBe(true)
    expect(btn3d.text()).toContain('3D-film')

    // Sjekk at 3D-film knappen er plassert etter hastighetsvelgeren (speed-stepper-control)
    const playbackButtons = wrapper.find('.playback-buttons')
    const children = playbackButtons.element.children
    const stepperIndex = Array.from(children).findIndex(el => el.classList.contains('speed-stepper-control'))
    const btn3dIndex = Array.from(children).findIndex(el => el.classList.contains('btn-playback-3d'))
    expect(stepperIndex).toBeGreaterThan(-1)
    expect(btn3dIndex).toBeGreaterThan(stepperIndex)

    await btn3d.trigger('click')
    expect(wrapper.emitted('play-3d')).toHaveLength(1)
  })

  it('viser 3D-film knapp til venstre for spiller av-indikatoren under avspilling', async () => {
    const wrapper = mount(TrackPlaybackPanel, {
      props: {
        track: mockTrack,
        isReplaying: true,
        replaySpeed: 40,
        showKmMarkers: true,
        showPhotosOnMap: true,
        onTrackPhotosCount: 0
      }
    })

    const btn3d = wrapper.find('.btn-playback-3d')
    const indicator = wrapper.find('.replay-status-indicator')
    expect(btn3d.exists()).toBe(true)
    expect(indicator.exists()).toBe(true)
    expect(indicator.text()).toContain('Spiller av...')
  })
})

