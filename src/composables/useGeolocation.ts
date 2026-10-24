import { ref, onUnmounted, getCurrentInstance } from 'vue'

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
  ele?: number
}

interface WakeLockSentinelLike {
  release: () => Promise<void>
}

interface NavigatorWithWakeLock {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>
  }
}

interface DeviceOrientationWithPermission {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

interface DeviceOrientationWithCompass extends DeviceOrientationEvent {
  webkitCompassHeading?: number
}

const STORAGE_KEY_TRACK = 'tortur_track_points'

const loadTrackFromStorage = (): TrackPoint[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_TRACK)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (err) {
    console.warn('[useGeolocation] Kunne ikke laste spor fra localStorage:', err)
  }
  return []
}

const saveTrackToStorage = (points: TrackPoint[]) => {
  try {
    if (points.length === 0) {
      localStorage.removeItem(STORAGE_KEY_TRACK)
    } else {
      localStorage.setItem(STORAGE_KEY_TRACK, JSON.stringify(points))
    }
  } catch (err) {
    console.warn('[useGeolocation] Kunne ikke lagre spor til localStorage:', err)
  }
}

export function useGeolocation() {
  const isSupported = ref('geolocation' in navigator)
  const isLocating = ref(false)
  const isLiveLocating = ref(false)
  const isTracking = ref(false)
  const error = ref<string | null>(null)
  const coords = ref<GeoLocationState | null>(null)
  const compassHeading = ref<number | null>(null)
  const trackPoints = ref<TrackPoint[]>(loadTrackFromStorage())

  let watchId: number | null = null
  let wakeLock: WakeLockSentinelLike | null = null
  let orientationListenerActive = false

  const requestWakeLock = async () => {
    try {
      const nav = navigator as unknown as NavigatorWithWakeLock
      if (nav.wakeLock) {
        wakeLock = await nav.wakeLock.request('screen')
      }
    } catch {
      // Ignorer dersom enheten nekter skjermlås-overstyring
    }
  }

  const releaseWakeLock = () => {
    if (wakeLock) {
      try {
        wakeLock.release()
      } catch {}
      wakeLock = null
    }
  }

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
    let added = false
    const createPoint = (): TrackPoint => {
      const pt: TrackPoint = {
        lat: point.lat,
        lng: point.lng,
        timestamp: point.timestamp || Date.now(),
      }
      if (point.altitude !== null && point.altitude !== undefined && !isNaN(point.altitude)) {
        pt.ele = Math.round(point.altitude * 10) / 10
      }
      return pt
    }

    if (!last) {
      trackPoints.value.push(createPoint())
      added = true
    } else {
      const dist = calculateDistanceMeters(last.lat, last.lng, point.lat, point.lng)
      // Kun legg til nytt punkt dersom man har beveget seg minst 4 meter (fjerner GPS-jitter)
      if (dist >= 4) {
        trackPoints.value.push(createPoint())
        added = true
      }
    }

    if (added) {
      saveTrackToStorage(trackPoints.value)
    }
  }

  const clearTrack = () => {
    trackPoints.value = []
    saveTrackToStorage([])
  }

  // Håndtering av kompassretning (orientering)
  const requestOrientationPermission = async (): Promise<boolean> => {
    if (typeof DeviceOrientationEvent !== 'undefined') {
      const devOrientation = DeviceOrientationEvent as unknown as DeviceOrientationWithPermission
      if (typeof devOrientation.requestPermission === 'function') {
        try {
          const res = await devOrientation.requestPermission()
          return res === 'granted'
        } catch (err) {
          console.warn('[useGeolocation] Feil ved forespørsel om orientering:', err)
          return false
        }
      }
    }
    return true
  }

  const handleOrientationEvent = (event: DeviceOrientationEvent) => {
    let heading: number | null = null

    // 1. iOS Safari (webkitCompassHeading er 0-360 grader med klokken fra nord)
    const compassEvt = event as DeviceOrientationWithCompass
    if (typeof compassEvt.webkitCompassHeading === 'number' && !isNaN(compassEvt.webkitCompassHeading) && compassEvt.webkitCompassHeading >= 0) {
      heading = compassEvt.webkitCompassHeading
    } else if (event.alpha !== null && event.alpha !== undefined && !isNaN(event.alpha)) {
      // 2. Android / standard DeviceOrientationEvent
      // alpha øker mot klokken, så 360 - alpha gir grader med klokken fra nord
      heading = (360 - event.alpha) % 360
    }

    if (heading !== null) {
      // Juster for skjermrotasjon (dersom enheten holdes liggende)
      let screenAngle = 0
      if (typeof window !== 'undefined') {
        if (window.screen?.orientation?.angle !== undefined) {
          screenAngle = window.screen.orientation.angle
        } else {
          const winWithOri = window as unknown as { orientation?: number }
          if (typeof winWithOri.orientation === 'number') {
            screenAngle = winWithOri.orientation || 0
          }
        }
      }

      let adjustedHeading = (heading + screenAngle) % 360
      if (adjustedHeading < 0) adjustedHeading += 360
      adjustedHeading = Math.round(adjustedHeading)

      // Unngå mikroskopisk jitter (oppdater hvis endring >= 1 grad)
      if (compassHeading.value === null || Math.abs(compassHeading.value - adjustedHeading) >= 1) {
        compassHeading.value = adjustedHeading
        if (coords.value && coords.value.heading !== adjustedHeading) {
          coords.value = {
            ...coords.value,
            heading: adjustedHeading,
          }
        }
      }
    }
  }

  const startOrientationTracking = async () => {
    if (typeof window === 'undefined' || orientationListenerActive) return
    const granted = await requestOrientationPermission()
    if (!granted) return

    const hasAbsolute = 'ondeviceorientationabsolute' in (window as object)
    if (hasAbsolute) {
      window.addEventListener('deviceorientationabsolute', handleOrientationEvent as EventListener, true)
    } else if (typeof DeviceOrientationEvent !== 'undefined') {
      const currentWin = window as Window
      currentWin.addEventListener('deviceorientation', handleOrientationEvent as EventListener, true)
    }
    orientationListenerActive = true
  }

  const stopOrientationTracking = () => {
    if (typeof window === 'undefined' || !orientationListenerActive) return
    window.removeEventListener('deviceorientationabsolute', handleOrientationEvent as EventListener, true)
    window.removeEventListener('deviceorientation', handleOrientationEvent as EventListener, true)
    orientationListenerActive = false
    compassHeading.value = null
  }

  const handleSuccess = (position: GeolocationPosition) => {
    const effectiveHeading =
      compassHeading.value !== null
        ? compassHeading.value
        : position.coords.heading !== null && !isNaN(position.coords.heading)
          ? Math.round(position.coords.heading)
          : coords.value?.heading ?? null

    coords.value = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy,
      heading: effectiveHeading,
      speed: position.coords.speed,
      altitude: position.coords.altitude,
      timestamp: position.timestamp,
    }
    isLocating.value = false
    error.value = null

    // Kun lagre til sporlogg hvis faktisk spor-opptak ("Spor meg") pågår
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
        ...options,
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
        geoOptions,
      )
    })
  }

  const ensureWatching = (options?: PositionOptions, onUpdate?: (coords: GeoLocationState) => void) => {
    if (!isSupported.value) {
      error.value = 'Geolokasjon støttes ikke i denne nettleseren.'
      return
    }

    requestWakeLock()
    startOrientationTracking()

    if (watchId !== null) return

    isLocating.value = true
    error.value = null

    const geoOptions: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 1000,
      ...options,
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
      geoOptions,
    )
  }

  const stopWatchingIfUnneeded = () => {
    if (!isTracking.value && !isLiveLocating.value) {
      releaseWakeLock()
      stopOrientationTracking()
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId)
        watchId = null
      }
      isLocating.value = false
    }
  }

  // "Hvor er jeg" – kontinuerlig live-posisjon og retningsvisning uten sporlagring
  const startLiveLocating = (options?: PositionOptions, onUpdate?: (coords: GeoLocationState) => void) => {
    isLiveLocating.value = true
    ensureWatching(options, onUpdate)
  }

  const stopLiveLocating = () => {
    isLiveLocating.value = false
    if (!isTracking.value && coords.value) {
      coords.value = {
        ...coords.value,
        heading: null,
      }
    }
    stopWatchingIfUnneeded()
  }

  const toggleLiveLocating = (options?: PositionOptions, onUpdate?: (coords: GeoLocationState) => void) => {
    if (isLiveLocating.value) {
      stopLiveLocating()
    } else {
      startLiveLocating(options, onUpdate)
    }
  }

  // "Spor meg" – kontinuerlig opptak og lagring av GPS-spor
  const startTracking = (options?: PositionOptions, onUpdate?: (coords: GeoLocationState) => void) => {
    isTracking.value = true
    if (coords.value && trackPoints.value.length === 0) {
      recordTrackPoint(coords.value)
    }
    ensureWatching(options, onUpdate)
  }

  const stopTracking = () => {
    isTracking.value = false
    stopWatchingIfUnneeded()
  }

  if (getCurrentInstance()) {
    onUnmounted(() => {
      isLiveLocating.value = false
      isTracking.value = false
      stopWatchingIfUnneeded()
    })
  }

  return {
    isSupported,
    isLocating,
    isLiveLocating,
    isTracking,
    error,
    coords,
    compassHeading,
    trackPoints,
    getCurrentPosition,
    startLiveLocating,
    stopLiveLocating,
    toggleLiveLocating,
    startTracking,
    stopTracking,
    clearTrack,
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
  lon2: number,
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
