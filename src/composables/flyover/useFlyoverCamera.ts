import { ref } from 'vue'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { FlyoverSamplePoint } from '@/utils/flyoverPath'
import {
  computeClearPitch,
  computeOpenSideBearing,
  computeSweepBearing,
  dampAngle,
  dampValue,
  type ElevationSampler,
} from '@/utils/flyoverCameraTerrain'

export type FlyoverCameraMode = 'follow' | 'orbit' | 'birdsEye' | 'free'

export interface CameraViewConfig {
  pitch: number
  zoom: number
  bearingOffset: number
}

const SWEEP_AMPLITUDE_DEG = 50
const SWEEP_PERIOD_SECONDS = 18
const SWEEP_RAD_PER_SEC = (2 * Math.PI) / SWEEP_PERIOD_SECONDS
const OPEN_SIDE_RESAMPLE_INTERVAL_SEC = 0.25

export function useFlyoverCamera(getMap: () => MapLibreMap | null) {
  const cameraMode = ref<FlyoverCameraMode>('follow')
  const orbitAngle = ref(0)
  const isUserInteracting = ref(false)

  // Intern tilstand for terrengbevisst sveip og siktlinje-glatting
  let sweepPhase = 0
  let targetBaseBearing: number | null = null
  let smoothedBaseBearing: number | null = null
  let smoothedPitch: number | null = null
  let secondsSinceOpenSideSample = OPEN_SIDE_RESAMPLE_INTERVAL_SEC

  // Standard parametere for ulike moduser
  const config = ref<CameraViewConfig>({
    pitch: 65,
    zoom: 15.2,
    bearingOffset: 0,
  })

  const setCameraMode = (mode: FlyoverCameraMode) => {
    cameraMode.value = mode
    secondsSinceOpenSideSample = OPEN_SIDE_RESAMPLE_INTERVAL_SEC
    if (mode === 'birdsEye') {
      config.value.pitch = 25
      config.value.zoom = 14.5
    } else if (mode === 'follow') {
      config.value.pitch = 65
      config.value.zoom = 15.2
    } else if (mode === 'orbit') {
      config.value.pitch = 58
      config.value.zoom = 15.0
      sweepPhase = 0
      targetBaseBearing = null
      smoothedBaseBearing = null
    }
    smoothedPitch = null
  }

  const createElevationSampler = (map: MapLibreMap): ElevationSampler | null => {
    if (typeof map.queryTerrainElevation !== 'function') {
      return null
    }
    return (lng: number, lat: number) => {
      try {
        const val = map.queryTerrainElevation([lng, lat])
        return typeof val === 'number' && Number.isFinite(val) ? val : null
      } catch {
        return null
      }
    }
  }

  const getTerrainExaggeration = (map: MapLibreMap): number => {
    if (typeof map.getTerrain === 'function') {
      const terrain = map.getTerrain()
      if (terrain && typeof terrain.exaggeration === 'number' && Number.isFinite(terrain.exaggeration)) {
        return terrain.exaggeration
      }
    }
    return 1.3
  }

  const resolveSmoothedClearPitch = (
    map: MapLibreMap,
    currentPoint: FlyoverSamplePoint,
    cameraBearing: number,
    desiredPitch: number,
    dtSeconds: number,
    sampler: ElevationSampler | null,
  ): number => {
    let targetPitch = desiredPitch
    if (sampler) {
      const centerEle = sampler(currentPoint.lng, currentPoint.lat)
      targetPitch = computeClearPitch(
        currentPoint.lat,
        currentPoint.lng,
        centerEle,
        cameraBearing,
        desiredPitch,
        sampler,
        {
          minPitch: 24,
          exaggeration: getTerrainExaggeration(map),
        },
      )
    }

    if (smoothedPitch === null || dtSeconds <= 0) {
      smoothedPitch = targetPitch
    } else {
      smoothedPitch = dampValue(smoothedPitch, targetPitch, dtSeconds, 3.5)
    }
    return smoothedPitch
  }

  /**
   * Oppdaterer kameraet for ett tidssteg (kalles fra rAF-løkken).
   */
  const updateCamera = (currentPoint: FlyoverSamplePoint, dtSeconds: number) => {
    const map = getMap()
    if (!map) return

    // Hvis brukeren manuelt roterer/drar kartet, ikke overstyr kameraet
    if (cameraMode.value === 'free' || isUserInteracting.value) {
      return
    }

    const sampler = createElevationSampler(map)

    if (cameraMode.value === 'follow') {
      // Kamera plassert rettet mot kjøreretningen, med siktlinjesjekk mot terreng
      const bearing = (currentPoint.bearing + config.value.bearingOffset + 360) % 360
      const pitch = resolveSmoothedClearPitch(
        map,
        currentPoint,
        bearing,
        config.value.pitch,
        dtSeconds,
        sampler,
      )

      map.jumpTo({
        center: [currentPoint.lng, currentPoint.lat],
        bearing,
        pitch,
        zoom: config.value.zoom,
      })
    } else if (cameraMode.value === 'orbit') {
      // Terrengbevisst pendel-sveip (±50° frem og tilbake på den åpne siden av terrenget)
      sweepPhase += Math.max(0, dtSeconds) * SWEEP_RAD_PER_SEC
      secondsSinceOpenSideSample += Math.max(0, dtSeconds)

      if (
        targetBaseBearing === null ||
        secondsSinceOpenSideSample >= OPEN_SIDE_RESAMPLE_INTERVAL_SEC
      ) {
        secondsSinceOpenSideSample = 0
        targetBaseBearing = sampler
          ? computeOpenSideBearing(currentPoint.lat, currentPoint.lng, sampler, currentPoint.bearing)
          : (currentPoint.bearing + 360) % 360
      }

      if (smoothedBaseBearing === null || dtSeconds <= 0) {
        smoothedBaseBearing = targetBaseBearing
      } else {
        smoothedBaseBearing = dampAngle(smoothedBaseBearing, targetBaseBearing, dtSeconds, 1.8)
      }

      const sweepBearing = computeSweepBearing(smoothedBaseBearing, sweepPhase, SWEEP_AMPLITUDE_DEG)
      orbitAngle.value = sweepBearing

      const pitch = resolveSmoothedClearPitch(
        map,
        currentPoint,
        sweepBearing,
        config.value.pitch,
        dtSeconds,
        sampler,
      )

      map.jumpTo({
        center: [currentPoint.lng, currentPoint.lat],
        bearing: sweepBearing,
        pitch,
        zoom: config.value.zoom,
      })
    } else if (cameraMode.value === 'birdsEye') {
      // Høyt fugleperspektiv med litt vinkel mot nord
      map.jumpTo({
        center: [currentPoint.lng, currentPoint.lat],
        bearing: 0,
        pitch: config.value.pitch,
        zoom: config.value.zoom,
      })
    }
  }

  const setZoom = (zoom: number) => {
    config.value.zoom = Math.max(10, Math.min(18, zoom))
    const map = getMap()
    if (map) {
      map.setZoom(config.value.zoom)
    }
  }

  const setPitch = (pitch: number) => {
    config.value.pitch = Math.max(0, Math.min(85, pitch))
    smoothedPitch = config.value.pitch
    const map = getMap()
    if (map) {
      map.setPitch(config.value.pitch)
    }
  }

  return {
    cameraMode,
    config,
    isUserInteracting,
    setCameraMode,
    updateCamera,
    setZoom,
    setPitch,
  }
}
