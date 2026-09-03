import { ref, computed } from 'vue'

export interface AisVessel {
  mmsi: number
  name: string
  shipType: string
  shipCategory: 'passenger' | 'cargo' | 'tanker' | 'tug' | 'rescue' | 'fishing' | 'military' | 'other'
  lat: number
  lng: number
  sog: number // Speed over ground (knop)
  cog: number // Course over ground (grader)
  heading: number | null
  destination?: string | null
  navStatus?: string | null
  updatedAt: string
}

export interface BarentsWatchCredentials {
  clientId: string
  clientSecret: string
}

const MIN_ZOOM_FOR_AIS = 12

export function useAis() {
  const isEnabled = ref(false)
  const isZoomSufficient = ref(false)
  const currentZoom = ref(13)
  const vessels = ref<AisVessel[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  
  const credentials = ref<BarentsWatchCredentials>({
    clientId: localStorage.getItem('bw_client_id') || '',
    clientSecret: localStorage.getItem('bw_client_secret') || ''
  })

  let accessToken: string | null = null
  let tokenExpiresAt = 0

  const hasCredentials = computed(() => {
    return !!(credentials.value.clientId.trim() && credentials.value.clientSecret.trim())
  })

  const clearError = () => {
    error.value = null
  }

  const setCredentials = (clientId: string, clientSecret: string) => {
    credentials.value = {
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim()
    }
    error.value = null
    if (clientId.trim() && clientSecret.trim()) {
      localStorage.setItem('bw_client_id', clientId.trim())
      localStorage.setItem('bw_client_secret', clientSecret.trim())
    } else {
      localStorage.removeItem('bw_client_id')
      localStorage.removeItem('bw_client_secret')
    }
    accessToken = null
    tokenExpiresAt = 0
  }

  const getOAuthToken = async (): Promise<string | null> => {
    if (accessToken && Date.now() < tokenExpiresAt - 60000) {
      return accessToken
    }
    if (!hasCredentials.value) return null

    try {
      const clientId = credentials.value.clientId.trim()
      const clientSecret = credentials.value.clientSecret.trim()

      const tokenEndpoints = import.meta.env.DEV
        ? ['/tortur/api/bw-token']
        : [
            `${import.meta.env.BASE_URL}api/bw-token.php`,
            'https://id.barentswatch.no/connect/token'
          ]

      const tryFetchToken = async (scope: string) => {
        let lastError = ''
        for (const endpoint of tokenEndpoints) {
          try {
            const params = new URLSearchParams()
            params.append('grant_type', 'client_credentials')
            params.append('client_id', clientId)
            params.append('client_secret', clientSecret)
            params.append('scope', scope)

            const res = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: params
            })

            if (!res.ok) {
              let detail = ''
              try {
                const errData = await res.json()
                detail = errData.error_description || errData.error || ''
              } catch {
                detail = await res.text()
              }
              lastError = detail
              return { ok: false, status: res.status, detail }
            }

            const data = await res.json()
            return { ok: true, data }
          } catch (err: any) {
            lastError = err.message || 'Nettverksfeil mot token-server'
          }
        }
        return { ok: false, status: 0, detail: lastError }
      }

      // Prøv først med scope 'ais', deretter fallback til 'api'
      let result = await tryFetchToken('ais')
      if (!result.ok && result.detail && (result.detail.includes('scope') || result.detail.includes('invalid_scope'))) {
        result = await tryFetchToken('api')
      }

      if (!result.ok) {
        let msg = `BarentsWatch feil (${result.status}): ${result.detail || 'Ugyldig Client ID eller Client Secret'}`
        if (result.detail === 'invalid_client') {
          msg = `BarentsWatch feil: Ugyldig Client ID eller Secret. Merk at Client ID er "${clientId}", og passordet må være det du valgte da du opprettet API-klienten på Min side.`
        }
        throw new Error(msg)
      }

      accessToken = result.data.access_token
      tokenExpiresAt = Date.now() + (result.data.expires_in || 3600) * 1000
      error.value = null
      return accessToken
    } catch (err: any) {
      error.value = err.message || 'Kunne ikke hente BarentsWatch-token'
      return null
    }
  }

  // Generer realistiske kystfartøy for demonstrasjon når BarentsWatch credentials ikke er oppgitt eller ved tilkoblingsfeil
  const getSimulatedVessels = (bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }): AisVessel[] => {
    const mockFleet = [
      { name: 'MS Nordnorge', category: 'passenger', type: 'Passasjerskip / Kystruten', speed: 14.8, course: 345, dest: 'Trondheim', relLat: 0.52, relLng: 0.48 },
      { name: 'MF Fedjebjørn', category: 'passenger', type: 'Bilferge', speed: 11.2, course: 120, dest: 'Fedje - Sævrøy', relLat: 0.42, relLng: 0.51 },
      { name: 'Beffen', category: 'passenger', type: 'Passasjerbåt', speed: 4.5, course: 85, dest: 'Vågen', relLat: 0.49, relLng: 0.53 },
      { name: 'RS Kristian Gerhard Jebsen', category: 'rescue', type: 'Redningsskøyte', speed: 28.0, course: 210, dest: 'Patrulje', relLat: 0.61, relLng: 0.38 },
      { name: 'KV Bergen', category: 'rescue', type: 'Kystvaktfartøy', speed: 12.4, course: 15, dest: 'Kystvakt', relLat: 0.68, relLng: 0.32 },
      { name: 'Fjord Tug', category: 'tug', type: 'Slepebåt / Taubåt', speed: 6.8, course: 180, dest: 'Mongstad', relLat: 0.35, relLng: 0.45 },
      { name: 'Nordic Bulk', category: 'cargo', type: 'Bulkskip', speed: 10.5, course: 290, dest: 'Rotterdam', relLat: 0.72, relLng: 0.62 },
      { name: 'Fjord Tanker', category: 'tanker', type: 'Kjemikalietanker', speed: 9.1, course: 310, dest: 'Kollsnes', relLat: 0.28, relLng: 0.41 }
    ]

    const timeStr = new Date().toLocaleTimeString('no', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    const latSpan = bounds.maxLat - bounds.minLat
    const lngSpan = bounds.maxLng - bounds.minLng

    return mockFleet.map((ship, idx) => ({
      mmsi: 257000000 + idx * 111,
      name: ship.name,
      shipType: ship.type,
      shipCategory: ship.category as any,
      lat: bounds.minLat + latSpan * ship.relLat,
      lng: bounds.minLng + lngSpan * ship.relLng,
      sog: ship.speed,
      cog: ship.course,
      heading: ship.course,
      destination: ship.dest,
      updatedAt: timeStr
    }))
  }

  const fetchVessels = async (bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }, zoom: number) => {
    currentZoom.value = zoom
    isZoomSufficient.value = zoom >= MIN_ZOOM_FOR_AIS

    if (!isEnabled.value || !isZoomSufficient.value) {
      vessels.value = []
      return
    }

    isLoading.value = true

    try {
      if (hasCredentials.value) {
        const token = await getOAuthToken()
        if (token) {
          // BarentsWatch GeoJSON polygon for bounding box
          const polygon = {
            type: 'Polygon',
            coordinates: [[
              [bounds.minLng, bounds.minLat],
              [bounds.maxLng, bounds.minLat],
              [bounds.maxLng, bounds.maxLat],
              [bounds.minLng, bounds.maxLat],
              [bounds.minLng, bounds.minLat]
            ]]
          }

          const aisEndpoints = import.meta.env.DEV
            ? ['/tortur/api/bw-ais/v1/latest/combined']
            : [
                `${import.meta.env.BASE_URL}api/bw-ais.php?token=${encodeURIComponent(token)}`,
                'https://live.ais.barentswatch.no/v1/latest/combined'
              ]

          for (const endpoint of aisEndpoints) {
            try {
              const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(polygon)
              })

              if (res.ok) {
                const data = await res.json()
                const timeStr = new Date().toLocaleTimeString('no', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                
                const navStatusMap: Record<number, string> = {
                  0: 'Underveis for motor',
                  1: 'Til ankers',
                  2: 'Ikke under kommando',
                  3: 'Begrenset manøvrerbarhet',
                  4: 'Hemmet av dypgående',
                  5: 'Fortøyd ved kai',
                  6: 'På grunn',
                  7: 'Fiske',
                  8: 'Under seil',
                  15: 'Udefinert'
                }

                const getShipTypeInfo = (code: number, explicitName?: string, vesselName?: string) => {
                  let cat: AisVessel['shipCategory'] = 'other'
                  let typeName = explicitName || `Fartøy (Type ${code})`

                  // Navnbasert overstyring: militære skip identifisert via prefiks
                  const militaryPrefixes = ['KNM ', 'HMS ', 'USS ', 'HDMS ', 'FGS ', 'FS ', 'HNLMS ', 'HNoMS ']
                  const upperName = (vesselName || '').toUpperCase()
                  if (militaryPrefixes.some(p => upperName.startsWith(p.toUpperCase()))) {
                    typeName = explicitName || 'Militært fartøy (Marine)'
                    return { typeName, cat: 'military' as AisVessel['shipCategory'] }
                  }

                  if (code === 35) {
                    typeName = explicitName || 'Militært fartøy'
                    cat = 'military'
                  } else if (code === 30 || (code >= 31 && code <= 39)) {
                    typeName = explicitName || (code === 36 ? 'Seilbåt' : (code === 37 ? 'Fritidsbåt / Lystbåt' : 'Fiskefartøy'))
                    cat = (code === 36 || code === 37) ? 'other' : 'fishing'
                  } else if (code >= 40 && code <= 49) {
                    typeName = explicitName || 'Hurtigbåt (HSC)'
                    cat = 'passenger'
                  } else if (code === 50) {
                    typeName = explicitName || 'Losbåt (Pilot)'
                    cat = 'tug'
                  } else if (code === 51) {
                    typeName = explicitName || 'Redningsfartøy (SAR)'
                    cat = 'rescue'
                  } else if (code === 52 || code === 53) {
                    typeName = explicitName || 'Slepebåt / Taubåt'
                    cat = 'tug'
                  } else if (code === 54) {
                    typeName = explicitName || 'Arbeidsfartøy / Miljøvern'
                    cat = 'tug'
                  } else if (code === 55) {
                    typeName = explicitName || 'Kystvakt / Politi'
                    cat = 'rescue'
                  } else if (code >= 60 && code <= 69) {
                    typeName = explicitName || (code === 60 ? 'Passasjerskip' : 'Passasjerskip (Cruiseskip / Ferge)')
                    cat = 'passenger'
                  } else if (code >= 70 && code <= 79) {
                    typeName = explicitName || 'Lasteskip (Cargo)'
                    cat = 'cargo'
                  } else if (code >= 80 && code <= 89) {
                    typeName = explicitName || (code === 82 ? 'Gass-/Tankskip (LNG/LPG)' : (code === 81 ? 'Kjemikalietanker' : (code === 83 ? 'Oljetanker' : 'Tankskip (Tanker)')))
                    cat = 'tanker'
                  } else if (code >= 90 && code <= 99) {
                    typeName = explicitName || 'Spesialfartøy'
                    cat = 'other'
                  }

                  return { typeName, cat }
                }

                vessels.value = (Array.isArray(data) ? data : []).map((item: any) => {
                  const typeCode = item.shipType || 0
                  const rawName = item.name ? item.name.trim() : ''
                  const { typeName, cat } = getShipTypeInfo(typeCode, item.shipTypeName, rawName)

                  const sog = item.speedOverGround ?? item.sog ?? 0
                  const cog = item.courseOverGround ?? item.cog ?? 0
                  const heading = (item.trueHeading !== undefined && item.trueHeading !== null && item.trueHeading !== 511)
                    ? item.trueHeading
                    : cog

                  let updatedAt = timeStr
                  if (item.msgtime) {
                    try {
                      updatedAt = new Date(item.msgtime).toLocaleTimeString('no', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    } catch {
                      updatedAt = timeStr
                    }
                  }

                  const statusText = item.navigationalStatus !== undefined ? navStatusMap[item.navigationalStatus] : null
                  const rawDest = item.destination ? item.destination.trim() : null
                  const destination = (rawDest && rawDest !== '===') ? rawDest : null

                  return {
                    mmsi: item.mmsi,
                    name: item.name ? item.name.trim() : `Fartøy ${item.mmsi}`,
                    shipType: typeName,
                    shipCategory: cat,
                    lat: item.latitude,
                    lng: item.longitude,
                    sog,
                    cog,
                    heading,
                    destination,
                    navStatus: statusText,
                    updatedAt
                  }
                })
                error.value = null
                return
              }
            } catch {
              // Prøv neste endpoint
            }
          }
        }
      }

      // Fallback / Live demo stream hvis credentials mangler eller ved feil
      vessels.value = getSimulatedVessels(bounds)
    } catch (err: any) {
      console.warn('AIS fetch warning, using demo fleet:', err)
      vessels.value = getSimulatedVessels(bounds)
    } finally {
      isLoading.value = false
    }
  }

  const toggleAis = () => {
    isEnabled.value = !isEnabled.value
    if (!isEnabled.value) {
      vessels.value = []
      error.value = null
    }
  }

  return {
    isEnabled,
    isZoomSufficient,
    minZoomForAis: MIN_ZOOM_FOR_AIS,
    currentZoom,
    vessels,
    isLoading,
    error,
    credentials,
    hasCredentials,
    setCredentials,
    fetchVessels,
    toggleAis,
    clearError
  }
}
