import { ref } from 'vue'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { FlyoverSamplePoint } from '@/utils/flyoverPath'

export type FlyoverCameraMode = 'follow' | 'orbit' | 'birdsEye' | 'free'

export interface CameraViewConfig {
  pitch: number
  zoom: number
  bearingOffset: number
}

export function useFlyoverCamera(getMap: () => MapLibreMap | null) {
  const cameraMode = ref<FlyoverCameraMode>('follow')
  const orbitAngle = ref(0)
  const isUserInteracting = ref(false)

  // Standard parametere for ulike moduser
  const config = ref<CameraViewConfig>({
    pitch: 65,
    zoom: 15.2,
    bearingOffset: 0
  })

  const setCameraMode = (mode: FlyoverCameraMode) => {
    cameraMode.value = mode
    if (mode === 'birdsEye') {
      config.value.pitch = 25
      config.value.zoom = 14.5
    } else if (mode === 'follow') {
      config.value.pitch = 65
      config.value.zoom = 15.2
    }
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

    if (cameraMode.value === 'follow') {
      // Kamera plassert rettet mot kjøreretningen
      const bearing = (currentPoint.bearing + config.value.bearingOffset + 360) % 360

      map.jumpTo({
        center: [currentPoint.lng, currentPoint.lat],
        bearing,
        pitch: config.value.pitch,
        zoom: config.value.zoom
      })
    } else if (cameraMode.value === 'orbit') {
      // Sirkler rolig rundt markøren (f.eks. 15 grader per sekund)
      orbitAngle.value = (orbitAngle.value + dtSeconds * 15) % 360

      map.jumpTo({
        center: [currentPoint.lng, currentPoint.lat],
        bearing: orbitAngle.value,
        pitch: 60,
        zoom: config.value.zoom
      })
    } else if (cameraMode.value === 'birdsEye') {
      // Høyt fugleperspektiv med litt vinkel mot nord
      map.jumpTo({
        center: [currentPoint.lng, currentPoint.lat],
        bearing: 0,
        pitch: config.value.pitch,
        zoom: config.value.zoom
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
    setPitch
  }
}
