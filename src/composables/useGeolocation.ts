import { ref, onUnmounted } from 'vue'

export interface GeoLocationState {
  lat: number
  lng: number
  accuracy: number | null
  heading: number | null
  speed: number | null
  altitude: number | null
  timestamp: number | null
}

export interface TrackPoint {
  lat: number
  lng: number
  timestamp?: number
}

export function useGeolocation() {
  const isSupported = ref('geolocation' in navigator)
  const isLocating = ref(false)
  const isTracking = ref(false)
  const error = ref<string | null>(null)
  const coords = ref<GeoLocationState | null>(null)
  const trackPoints = ref<TrackPoint[]>([])

  let watchId: number | null = null

  const getErrorMessage = (err: GeolocationPositionError): string => {
    switch (err.code) {
      case err.PERMISSION_DENIED:
        return 'Posisjonstillatelse ble avvist i nettleseren. Vennligst tillat stedsdata for å se posisjonen din på kartet.'
      case err.POSITION_UNAVAILABLE:
        return 'Posisjonsinformasjon er utilgjengelig for øyeblikket.'
      case err.TIMEOUT:
        return 'Tidsavbrudd ved innhenting av posisjon. Prøv igjen.'
      default:
        return err.message || 'Ukjent feil ved henting av posisjon.'
    }
  }

  const recordTrackPoint = (point: GeoLocationState) => {
    if (point.accuracy !== null && point.accuracy > 50) return

    const last = trackPoints.value[trackPoints.value.length - 1]
    if (!last) {
      trackPoints.value.push({
        lat: point.lat,
        lng: point.lng,
        timestamp: point.timestamp || Date.now()
      })
    } else {
      const dist = calculateDistanceMeters(last.lat, last.lng, point.lat, point.lng)
      // Kun legg til nytt punkt dersom man har beveget seg minst 4 meter (fjerner GPS-jitter)
      if (dist >= 4) {
        trackPoints.value.push({
          lat: point.lat,
          lng: point.lng,
          timestamp: point.timestamp || Date.now()
        })
      }
    }
  }

  const clearTrack = () => {
    trackPoints.value = []
  }

  const handleSuccess = (position: GeolocationPosition) => {
    coords.value = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy,
      heading: position.coords.heading,
      speed: position.coords.speed,
      altitude: position.coords.altitude,
      timestamp: position.timestamp
    }
    isLocating.value = false
    error.value = null

    if (isTracking.value) {
      recordTrackPoint(coords.value)
    }
  }

  const handleError = (err: GeolocationPositionError) => {
    error.value = getErrorMessage(err)
    isLocating.value = false
  }

  const getCurrentPosition = (options?: PositionOptions): Promise<GeoLocationState> => {
    return new Promise((resolve, reject) => {
      if (!isSupported.value) {
        const msg = 'Geolokasjon støttes ikke i denne nettleseren.'
        error.value = msg
        return reject(new Error(msg))
      }

      isLocating.value = true
      error.value = null

      const geoOptions: PositionOptions = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
        ...options
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          handleSuccess(pos)
          if (coords.value) {
            resolve(coords.value)
          }
        },
        (err) => {
          handleError(err)
          reject(err)
        },
        geoOptions
      )
    })
  }

  const startTracking = (options?: PositionOptions, onUpdate?: (coords: GeoLocationState) => void) => {
    if (!isSupported.value) {
      error.value = 'Geolokasjon støttes ikke i denne nettleseren.'
      return
    }

    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId)
    }

    isTracking.value = true
    isLocating.value = true
    error.value = null

    // Hvis vi allerede har koordinater og ingen punkter i sporet, legg til startpunkt
    if (coords.value && trackPoints.value.length === 0) {
      recordTrackPoint(coords.value)
    }

    const geoOptions: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 1000,
      ...options
    }

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        handleSuccess(pos)
        if (coords.value && onUpdate) {
          onUpdate(coords.value)
        }
      },
      (err) => {
        handleError(err)
      },
      geoOptions
    )
  }

  const stopTracking = () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId)
      watchId = null
    }
    isTracking.value = false
    isLocating.value = false
  }

  onUnmounted(() => {
    stopTracking()
  })

  return {
    isSupported,
    isLocating,
    isTracking,
    error,
    coords,
    trackPoints,
    getCurrentPosition,
    startTracking,
    stopTracking,
    clearTrack
  }
}

export const MAX_CHECKIN_DISTANCE_METERS = 100

/**
 * Beregner avstand i meter mellom to koordinater ved hjelp av Haversine-formelen.
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000 // Jordens radius i meter
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Formaterer avstand i meter eller kilometer (f.eks. "45 m" eller "1.2 km").
 */
export function formatDistance(meters: number | null | undefined): string {
  if (meters == null || isNaN(meters)) return 'Ukjent avstand'
  if (meters < 1000) {
    return `${Math.round(meters)} m`
  }
  return `${(meters / 1000).toFixed(1)} km`
}

