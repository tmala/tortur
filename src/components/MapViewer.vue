<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import L from 'leaflet'
import {
  type GeoLocationState,
  type TrackPoint,
  calculateDistanceMeters,
  formatDistance,
  MAX_CHECKIN_DISTANCE_METERS
} from '@/composables/useGeolocation'
import type { TurpostItem } from '@/composables/useTurposter'
import type { AisVessel } from '@/composables/useAis'

import { createTileLayers } from '@/utils/mapTileLayers'
import {
  createUserIcon,
  createTurpostIcon,
  createPrivateTurpostIcon,
  createSuggestionTurpostIcon
} from '@/utils/mapIcons'
import { useMapAisLayer } from '@/composables/map/useMapAisLayer'
import { useMapTrackLayer } from '@/composables/map/useMapTrackLayer'
import { useMapMunicipalitiesLayer } from '@/composables/map/useMapMunicipalitiesLayer'

const props = defineProps<{
  userLocation: GeoLocationState | null
  activeLayer: string
  isTracking: boolean
  turposter: TurpostItem[]
  showMunicipalities: boolean
  selectedKommuneName: string | null
  getKommuneInfo?: (name: string) => { fylkeName: string; count: number } | null
  vessels?: AisVessel[]
  isAisToggled?: boolean
  isZoomSufficient?: boolean
  isLoggedIn?: boolean
  visitedTurpostIds?: Set<string>
  isAdmin?: boolean
  trackPoints?: TrackPoint[]
  trackName?: string
  trackDistanceMeters?: number
  privateTurposter?: TurpostItem[]
  isAddSpotActive?: boolean
}>()

const emit = defineEmits<{
  (e: 'map-dragged'): void
  (e: 'map-ready'): void
  (e: 'coordinates-change', coords: { lat: number; lng: number; zoom: number }): void
  (e: 'bounds-change', bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }, zoom: number): void
  (e: 'select-turpost', post: TurpostItem): void
  (e: 'checkin-turpost', post: TurpostItem): void
  (e: 'view-checkins', post: TurpostItem, initialTab?: 'public' | 'private'): void
  (e: 'select-kommune-by-name', name: string): void
  (e: 'clear-turposter'): void
  (e: 'add-turpost-map-click', coords: { lat: number; lng: number }): void
  (e: 'delete-private-spot', spotId: string): void
  (e: 'click-track'): void
  (e: 'disable-municipalities'): void
  (e: 'track-replay-change', isPlaying: boolean): void
}>()

const mapContainer = ref<HTMLElement | null>(null)
let map: L.Map | null = null
let userMarker: L.Marker | null = null
let accuracyCircle: L.Circle | null = null
let currentTileLayer: L.TileLayer | null = null
let currentOverlayLayer: L.TileLayer | null = null
let turpostsLayerGroup: L.LayerGroup | null = null
let privateTurpostsLayerGroup: L.LayerGroup | null = null
let suggestionMarker: L.Marker | null = null
const markerMap = new Map<string, L.Marker>()

const aisLayer = useMapAisLayer(() => map)
const trackLayer = useMapTrackLayer(
  () => map,
  () => emit('click-track')
)
const municipalitiesLayer = useMapMunicipalitiesLayer(
  () => map,
  {
    getKommuneInfo: props.getKommuneInfo,
    getSelectedKommuneName: () => props.selectedKommuneName,
    onClearTurposter: () => emit('clear-turposter'),
    onSelectKommuneByName: (name: string) => emit('select-kommune-by-name', name),
    onDisableMunicipalities: () => emit('disable-municipalities')
  }
)

const switchLayer = (layerKey: string) => {
  if (!map) return

  if (currentTileLayer) {
    map.removeLayer(currentTileLayer)
    currentTileLayer = null
  }

  if (currentOverlayLayer) {
    map.removeLayer(currentOverlayLayer)
    currentOverlayLayer = null
  }

  const { baseLayer, overlayLayer } = createTileLayers(layerKey)
  currentTileLayer = baseLayer.addTo(map)
  if (overlayLayer) {
    currentOverlayLayer = overlayLayer.addTo(map)
  }
}

const updateUserMarker = (loc: GeoLocationState | null) => {
  if (!map) return

  if (!loc) {
    if (userMarker) {
      map.removeLayer(userMarker)
      userMarker = null
    }
    if (accuracyCircle) {
      map.removeLayer(accuracyCircle)
      accuracyCircle = null
    }
    return
  }

  const latLng: L.LatLngExpression = [loc.lat, loc.lng]

  if (!userMarker) {
    userMarker = L.marker(latLng, {
      icon: createUserIcon(loc.heading),
      interactive: false,
      zIndexOffset: 400
    }).addTo(map)
  } else {
    userMarker.setLatLng(latLng)
    userMarker.setIcon(createUserIcon(loc.heading))
  }

  if (loc.accuracy && loc.accuracy > 0) {
    if (!accuracyCircle) {
      accuracyCircle = L.circle(latLng, {
        radius: loc.accuracy,
        color: '#0284c7',
        fillColor: '#38bdf8',
        fillOpacity: 0.15,
        weight: 1.5,
        dashArray: '4, 4',
        interactive: false
      }).addTo(map)
    } else {
      accuracyCircle.setLatLng(latLng)
      accuracyCircle.setRadius(loc.accuracy)
    }
  } else if (accuracyCircle) {
    map.removeLayer(accuracyCircle)
    accuracyCircle = null
  }
}

const updateTurpostMarkers = (posts: TurpostItem[], shouldFitBounds = false) => {
  if (!map || !turpostsLayerGroup) return

  turpostsLayerGroup.clearLayers()
  markerMap.clear()

  if (posts.length === 0) return

  const bounds = L.latLngBounds([])

  posts.forEach(post => {
    const latLng: L.LatLngTuple = [post.lat, post.lng]
    bounds.extend(latLng)

    const isVisited = props.visitedTurpostIds?.has(String(post.id)) ?? false

    // Sjekk om innlogget bruker har en privat turpost på samme sted (samme ID eller innen 15m)
    const matchingPrivateSpot = props.privateTurposter?.find((priv) => {
      if (String(priv.id) === String(post.id)) return true
      const dist = calculateDistanceMeters(priv.lat, priv.lng, post.lat, post.lng)
      return dist < 15
    })
    const isPrivateVisited = matchingPrivateSpot
      ? (props.visitedTurpostIds?.has(String(matchingPrivateSpot.id)) ?? false)
      : false

    const marker = L.marker(latLng, {
      icon: createTurpostIcon(isVisited),
      title: matchingPrivateSpot ? `${post.name} (Offentlig + Min private)` : post.name,
      zIndexOffset: isVisited ? 550 : 500
    })

    const getPopupHtml = () => {
      const distance = props.userLocation
        ? calculateDistanceMeters(props.userLocation.lat, props.userLocation.lng, post.lat, post.lng)
        : null
      const isWithinRange = distance !== null && distance <= MAX_CHECKIN_DISTANCE_METERS

      let distanceBadgeHtml = ''
      if (props.isLoggedIn) {
        if (distance !== null) {
          if (isWithinRange) {
            distanceBadgeHtml = `<div class="popup-range-badge in-range">📍 Innen rekkevidde (${Math.round(distance)} m)</div>`
          } else {
            distanceBadgeHtml = `<div class="popup-range-badge out-of-range">⚠️ For langt unna (${formatDistance(distance)}) – må være innen 100m</div>`
          }
        } else {
          distanceBadgeHtml = `<div class="popup-range-badge no-location">⚠️ Posisjon mangler – kreves for innsjekk (maks 100m)</div>`
        }
      }

      if (matchingPrivateSpot) {
        return `
          <div class="turpost-popup">
            <div class="popup-tabs">
              <button type="button" class="popup-tab-btn active" id="tab-btn-pub-${post.id}">
                🌐 Offentlig
              </button>
              <button type="button" class="popup-tab-btn tab-btn-priv" id="tab-btn-priv-${post.id}">
                ⭐ Min private
              </button>
            </div>

            <div id="popup-panel-pub-${post.id}" class="popup-tab-panel">
              <h4>${post.name}</h4>
              ${post.alt ? `<div class="popup-badge">⛰️ ${post.alt} moh.</div>` : ''}
              ${props.isLoggedIn ? `
                <div class="popup-status-badge ${isVisited ? 'visited' : 'not-visited'}">
                  ${isVisited ? '✓ Besøkt (offentlig)' : 'Ikke besøkt (offentlig)'}
                </div>
              ` : ''}
              <div class="popup-info">
                Posisjon: ${post.lat.toFixed(5)}°, ${post.lng.toFixed(5)}°
              </div>
              ${distanceBadgeHtml}
              ${props.isLoggedIn ? `
                <div class="turpost-popup-actions">
                  <button type="button" class="btn-popup-view" id="view-checkins-btn-${post.id}">
                    👁️ Vis innsjekkinger
                  </button>
                  ${isWithinRange ? `
                    <button type="button" class="btn-popup-checkin" id="checkin-btn-${post.id}">
                      📍 Sjekk inn her
                    </button>
                  ` : `
                    <button type="button" class="btn-popup-checkin btn-popup-checkin-disabled" id="checkin-btn-${post.id}" disabled title="Du må være innen 100m fra turposten for å sjekke inn">
                      📍 Sjekk inn (${distance !== null ? formatDistance(distance) : 'mangler posisjon'})
                    </button>
                  `}
                </div>
              ` : `
                <div class="popup-checkin-hint">Logg inn for å se innsjekkinger og sjekke inn</div>
              `}
            </div>

            <div id="popup-panel-priv-${post.id}" class="popup-tab-panel" style="display: none;">
              <div class="popup-private-tag">⭐ Min private turpost</div>
              <h4>${matchingPrivateSpot.name}</h4>
              ${matchingPrivateSpot.alt ? `<div class="popup-badge">⛰️ ${matchingPrivateSpot.alt} moh.</div>` : ''}
              <div class="popup-status-badge ${isPrivateVisited ? 'visited' : 'not-visited'}">
                ${isPrivateVisited ? '✓ Besøkt (privat)' : 'Ikke besøkt (privat)'}
              </div>
              <div class="popup-info">
                Posisjon: ${matchingPrivateSpot.lat.toFixed(5)}°, ${matchingPrivateSpot.lng.toFixed(5)}°
              </div>
              ${distanceBadgeHtml}
              <div class="turpost-popup-actions">
                <button type="button" class="btn-popup-view" id="view-priv-checkins-btn-${post.id}">
                  👁️ Vis private innsjekkinger
                </button>
                ${isWithinRange ? `
                  <button type="button" class="btn-popup-checkin" id="checkin-priv-btn-${post.id}">
                    📍 Sjekk inn (privat)
                  </button>
                ` : `
                  <button type="button" class="btn-popup-checkin btn-popup-checkin-disabled" disabled>
                    📍 Sjekk inn (${distance !== null ? formatDistance(distance) : 'mangler posisjon'})
                  </button>
                `}
                <button type="button" class="btn-popup-delete-spot" id="delete-priv-spot-btn-${post.id}">
                  🗑️ Slett privat turpost
                </button>
              </div>
            </div>
          </div>
        `
      }

      return `
        <div class="turpost-popup">
          <h4>${post.name}</h4>
          ${post.alt ? `<div class="popup-badge">⛰️ ${post.alt} moh.</div>` : ''}
          ${props.isLoggedIn ? `
            <div class="popup-status-badge ${isVisited ? 'visited' : 'not-visited'}">
              ${isVisited ? '✓ Besøkt' : 'Ikke besøkt'}
            </div>
          ` : ''}
          <div class="popup-info">
            Posisjon: ${post.lat.toFixed(5)}°, ${post.lng.toFixed(5)}°
          </div>
          ${distanceBadgeHtml}
          ${props.isLoggedIn ? `
            <div class="turpost-popup-actions">
              <button type="button" class="btn-popup-view" id="view-checkins-btn-${post.id}">
                👁️ Vis innsjekkinger
              </button>
              ${isWithinRange ? `
                <button type="button" class="btn-popup-checkin" id="checkin-btn-${post.id}">
                  📍 Sjekk inn her
                </button>
              ` : `
                <button type="button" class="btn-popup-checkin btn-popup-checkin-disabled" id="checkin-btn-${post.id}" disabled title="Du må være innen 100m fra turposten for å sjekke inn">
                  📍 Sjekk inn (${distance !== null ? formatDistance(distance) : 'mangler posisjon'})
                </button>
              `}
            </div>
          ` : `
            <div class="popup-checkin-hint">Logg inn for å se innsjekkinger og sjekke inn</div>
          `}
        </div>
      `
    }

    marker.bindPopup(getPopupHtml())
    marker.on('popupopen', () => {
      marker.setPopupContent(getPopupHtml())

      if (props.isLoggedIn) {
        if (matchingPrivateSpot) {
          const tabPub = document.getElementById(`tab-btn-pub-${post.id}`)
          const tabPriv = document.getElementById(`tab-btn-priv-${post.id}`)
          const panelPub = document.getElementById(`popup-panel-pub-${post.id}`)
          const panelPriv = document.getElementById(`popup-panel-priv-${post.id}`)

          if (tabPub && tabPriv && panelPub && panelPriv) {
            tabPub.onclick = (e) => {
              e.stopPropagation()
              tabPub.classList.add('active')
              tabPriv.classList.remove('active')
              panelPub.style.display = 'block'
              panelPriv.style.display = 'none'
            }
            tabPriv.onclick = (e) => {
              e.stopPropagation()
              tabPriv.classList.add('active')
              tabPub.classList.remove('active')
              panelPriv.style.display = 'block'
              panelPub.style.display = 'none'
            }
          }

          const viewPrivBtn = document.getElementById(`view-priv-checkins-btn-${post.id}`)
          if (viewPrivBtn) {
            viewPrivBtn.onclick = (e) => {
              e.stopPropagation()
              emit('view-checkins', post, 'private')
            }
          }

          const distance = props.userLocation
            ? calculateDistanceMeters(props.userLocation.lat, props.userLocation.lng, post.lat, post.lng)
            : null
          const isWithinRange = distance !== null && distance <= MAX_CHECKIN_DISTANCE_METERS

          if (isWithinRange) {
            const checkinPrivBtn = document.getElementById(`checkin-priv-btn-${post.id}`)
            if (checkinPrivBtn) {
              checkinPrivBtn.onclick = (e) => {
                e.stopPropagation()
                emit('checkin-turpost', matchingPrivateSpot)
              }
            }
          }

          const deletePrivBtn = document.getElementById(`delete-priv-spot-btn-${post.id}`)
          if (deletePrivBtn) {
            deletePrivBtn.onclick = (e) => {
              e.stopPropagation()
              if (confirm(`Vil du slette din private turpost «${matchingPrivateSpot.name}»?`)) {
                emit('delete-private-spot', String(matchingPrivateSpot.id))
                if (map) map.closePopup()
              }
            }
          }
        }

        const viewBtn = document.getElementById(`view-checkins-btn-${post.id}`)
        if (viewBtn) {
          viewBtn.onclick = (e) => {
            e.stopPropagation()
            emit('view-checkins', post, 'public')
          }
        }

        const distance = props.userLocation
          ? calculateDistanceMeters(props.userLocation.lat, props.userLocation.lng, post.lat, post.lng)
          : null
        const isWithinRange = distance !== null && distance <= MAX_CHECKIN_DISTANCE_METERS

        if (isWithinRange) {
          const checkinBtn = document.getElementById(`checkin-btn-${post.id}`)
          if (checkinBtn) {
            checkinBtn.onclick = (e) => {
              e.stopPropagation()
              emit('checkin-turpost', post)
            }
          }
        }
      }
    })
    marker.on('click', () => {
      emit('select-turpost', post)
    })

    marker.addTo(turpostsLayerGroup!)
    markerMap.set(post.id, marker)
  })

  // Sentrer og tilpass kartet automatisk KUN dersom shouldFitBounds er true
  if (shouldFitBounds && bounds.isValid()) {
    map.fitBounds(bounds, {
      padding: [60, 60],
      maxZoom: 14,
      animate: true
    })
  }
}

const updatePrivateTurpostMarkers = (posts: TurpostItem[]) => {
  if (!map || !privateTurpostsLayerGroup) return
  privateTurpostsLayerGroup.clearLayers()
  if (!posts || posts.length === 0) return

  const publicPosts = props.turposter || []

  // Ikke tegn privat markør dersom punktet allerede eksisterer som en offentlig turpost i kartet:
  // "Når en privat turpost legges inn som offentlig turpost vil jo det eksistere to turposter på samme punkt i kartet. Da skal kun den offentlige vises..."
  const visiblePrivatePosts = posts.filter((priv) => {
    return !publicPosts.some((pub) => {
      if (String(pub.id) === String(priv.id)) return true
      const dist = calculateDistanceMeters(pub.lat, pub.lng, priv.lat, priv.lng)
      return dist < 15
    })
  })

  visiblePrivatePosts.forEach((post) => {
    const latLng: L.LatLngTuple = [post.lat, post.lng]
    const isVisited = props.visitedTurpostIds?.has(String(post.id)) ?? false

    const marker = L.marker(latLng, {
      icon: createPrivateTurpostIcon(isVisited),
      title: `⭐ ${post.name} (Privat)`,
      zIndexOffset: isVisited ? 560 : 520
    })

    const getPopupHtml = () => {
      const distance = props.userLocation
        ? calculateDistanceMeters(props.userLocation.lat, props.userLocation.lng, post.lat, post.lng)
        : null
      const isWithinRange = distance !== null && distance <= MAX_CHECKIN_DISTANCE_METERS

      let distanceBadgeHtml = ''
      if (props.isLoggedIn) {
        if (distance !== null) {
          if (isWithinRange) {
            distanceBadgeHtml = `<div class="popup-range-badge in-range">📍 Innen rekkevidde (${Math.round(distance)} m)</div>`
          } else {
            distanceBadgeHtml = `<div class="popup-range-badge out-of-range">⚠️ For langt unna (${formatDistance(distance)}) – må være innen 100m</div>`
          }
        } else {
          distanceBadgeHtml = `<div class="popup-range-badge no-location">⚠️ Posisjon mangler – kreves for innsjekk (maks 100m)</div>`
        }
      }

      return `
        <div class="turpost-popup">
          <div class="popup-private-tag">⭐ Min private turpost</div>
          <h4>${post.name}</h4>
          ${post.alt ? `<div class="popup-badge">⛰️ ${post.alt} moh.</div>` : ''}
          ${props.isLoggedIn ? `
            <div class="popup-status-badge ${isVisited ? 'visited' : 'not-visited'}">
              ${isVisited ? '✓ Besøkt' : 'Ikke besøkt'}
            </div>
          ` : ''}
          <div class="popup-info">
            Posisjon: ${post.lat.toFixed(5)}°, ${post.lng.toFixed(5)}°
          </div>
          ${distanceBadgeHtml}
          ${props.isLoggedIn ? `
            <div class="turpost-popup-actions">
              <button type="button" class="btn-popup-view" id="view-checkins-btn-${post.id}">
                👁️ Vis innsjekkinger
              </button>
              ${isWithinRange ? `
                <button type="button" class="btn-popup-checkin" id="checkin-btn-${post.id}">
                  📍 Sjekk inn her
                </button>
              ` : `
                <button type="button" class="btn-popup-checkin btn-popup-checkin-disabled" id="checkin-btn-${post.id}" disabled title="Du må være innen 100m fra turposten for å sjekke inn">
                  📍 Sjekk inn (${distance !== null ? formatDistance(distance) : 'mangler posisjon'})
                </button>
              `}
              <button type="button" class="btn-popup-delete-spot" id="delete-spot-btn-${post.id}">
                🗑️ Slett denne turposten
              </button>
            </div>
          ` : ''}
        </div>
      `
    }

    marker.bindPopup(getPopupHtml())
    marker.on('popupopen', () => {
      marker.setPopupContent(getPopupHtml())

      if (props.isLoggedIn) {
        const viewBtn = document.getElementById(`view-checkins-btn-${post.id}`)
        if (viewBtn) {
          viewBtn.onclick = (e) => {
            e.stopPropagation()
            emit('view-checkins', post)
          }
        }

        const distance = props.userLocation
          ? calculateDistanceMeters(props.userLocation.lat, props.userLocation.lng, post.lat, post.lng)
          : null
        const isWithinRange = distance !== null && distance <= MAX_CHECKIN_DISTANCE_METERS

        if (isWithinRange) {
          const checkinBtn = document.getElementById(`checkin-btn-${post.id}`)
          if (checkinBtn) {
            checkinBtn.onclick = (e) => {
              e.stopPropagation()
              emit('checkin-turpost', post)
            }
          }
        }

        const deleteBtn = document.getElementById(`delete-spot-btn-${post.id}`)
        if (deleteBtn) {
          deleteBtn.onclick = (e) => {
            e.stopPropagation()
            if (confirm(`Vil du slette din private turpost «${post.name}»?`)) {
              emit('delete-private-spot', String(post.id))
              if (map) map.closePopup()
            }
          }
        }
      }
    })
    marker.on('click', () => {
      emit('select-turpost', post)
    })

    marker.addTo(privateTurpostsLayerGroup!)
    markerMap.set(String(post.id), marker)
  })
}

const isAutoCenter = ref(true)
const hasInitiallyCenteredOnUser = ref(false)

const centerOnUser = (animate = true, zoomLevel?: number) => {
  if (!map || !props.userLocation) return
  isAutoCenter.value = true
  hasInitiallyCenteredOnUser.value = true

  const targetZoom = zoomLevel ?? Math.max(map.getZoom(), 15)
  const targetLatLng: L.LatLngExpression = [props.userLocation.lat, props.userLocation.lng]

  if (animate) {
    map.flyTo(targetLatLng, targetZoom, {
      duration: 1.2,
      easeLinearity: 0.25
    })
  } else {
    map.setView(targetLatLng, targetZoom)
  }
}

watch(
  () => props.trackPoints,
  (points) => {
    trackLayer.updateTrackLayer(points, props.trackName, props.trackDistanceMeters)
  },
  { deep: true }
)

watch(
  () => [props.trackName, props.trackDistanceMeters],
  () => {
    trackLayer.updateTooltip(props.trackName, props.trackDistanceMeters)
  }
)

watch(trackLayer.isReplaying, (playing) => {
  emit('track-replay-change', playing)
})

const clearSpotSuggestion = () => {
  if (suggestionMarker && map) {
    map.removeLayer(suggestionMarker)
    suggestionMarker = null
  }
}

const flyToPost = (post: TurpostItem) => {
  if (!map) return

  clearSpotSuggestion()

  map.flyTo([post.lat, post.lng], Math.max(map.getZoom(), 15), {
    duration: 1.0,
    easeLinearity: 0.25
  })

  const openMarkerPopup = () => {
    const marker = markerMap.get(String(post.id)) || markerMap.get(post.id)
    if (marker) {
      marker.openPopup()
      return true
    }
    return false
  }

  setTimeout(() => {
    if (!openMarkerPopup()) {
      setTimeout(openMarkerPopup, 300)
    }
  }, 400)
}

const panToCoordinate = (lat: number, lng: number, zoomLevel?: number) => {
  if (!map) return
  const targetZoom = zoomLevel ?? Math.max(map.getZoom(), 14)
  map.flyTo([lat, lng], targetZoom, {
    duration: 1.2,
    easeLinearity: 0.25
  })
}

const zoomToTrack = (points?: TrackPoint[]) => {
  trackLayer.zoomToTrack(points || props.trackPoints)
}

const showSpotSuggestion = (spot: {
  lat: number
  lng: number
  name: string
  alt?: number | null
  kommune?: string
  fylke?: string
  userName?: string
  userEmail?: string
}) => {
  if (!map) return

  const latLng: L.LatLngTuple = [spot.lat, spot.lng]

  if (!suggestionMarker) {
    suggestionMarker = L.marker(latLng, {
      icon: createSuggestionTurpostIcon(),
      title: `Forslag: ${spot.name}`,
      zIndexOffset: 1200
    }).addTo(map)
  } else {
    suggestionMarker.setLatLng(latLng)
    suggestionMarker.setIcon(createSuggestionTurpostIcon())
  }

  const geoInfo = [spot.kommune, spot.fylke].filter(Boolean).join(', ')
  const userText = spot.userName || spot.userEmail ? `<br/>Foreslått av: ${spot.userName || spot.userEmail}` : ''
  const popupContent = `
    <div class="turpost-popup">
      <div class="popup-private-tag" style="background: rgba(249, 115, 22, 0.2); border-color: rgba(249, 115, 22, 0.5); color: #fdba74;">
        📋 Innkommet forslag
      </div>
      <h4>${spot.name}</h4>
      ${spot.alt ? `<div class="popup-badge">⛰️ ${spot.alt} moh.</div>` : ''}
      <div class="popup-info">
        ${geoInfo ? geoInfo + '<br/>' : ''}
        Posisjon: ${spot.lat.toFixed(5)}°, ${spot.lng.toFixed(5)}°
        ${userText}
      </div>
    </div>
  `

  suggestionMarker.bindPopup(popupContent).openPopup()

  map.flyTo(latLng, Math.max(map.getZoom(), 15), {
    duration: 1.0,
    easeLinearity: 0.25
  })
}


defineExpose({
  centerOnUser,
  flyToPost,
  panToCoordinate,
  zoomToTrack,
  showSpotSuggestion,
  clearSpotSuggestion,
  resetAutoCenter: () => {
    isAutoCenter.value = false
  },
  getMapInstance: () => map,
  startTrackReplay: trackLayer.startReplay,
  pauseTrackReplay: trackLayer.pauseReplay,
  stopTrackReplay: trackLayer.stopReplay,
  toggleTrackReplay: trackLayer.toggleReplay,
  isTrackReplaying: trackLayer.isReplaying,
  trackReplayProgress: trackLayer.replayProgress,
  trackReplaySpeed: trackLayer.replaySpeed,
  setTrackReplaySpeed: trackLayer.setReplaySpeed
})

watch(
  () => props.userLocation,
  (newLoc) => {
    if (newLoc) {
      updateUserMarker(newLoc)
      if (!hasInitiallyCenteredOnUser.value && isAutoCenter.value && map) {
        hasInitiallyCenteredOnUser.value = true
        map.setView([newLoc.lat, newLoc.lng], 15)
      } else if (props.isTracking && isAutoCenter.value && map) {
        map.panTo([newLoc.lat, newLoc.lng], { animate: true, duration: 0.5 })
      }
    }
  },
  { deep: true }
)

watch(
  () => props.isTracking,
  (tracking) => {
    if (tracking) {
      isAutoCenter.value = true
      if (props.userLocation && map) {
        map.panTo([props.userLocation.lat, props.userLocation.lng], { animate: true, duration: 0.5 })
      }
    }
  }
)

watch(
  () => props.activeLayer,
  (newLayer) => {
    switchLayer(newLayer)
  }
)

let lastTurpostSignature = ''

watch(
  () => props.turposter,
  (newPosts) => {
    const signature = (newPosts || []).map(p => p.id).join(',')
    const hasChanged = signature !== lastTurpostSignature
    lastTurpostSignature = signature

    // Tilpass kun kartutsnittet med fitBounds hvis det faktisk kom et nytt utvalg av turposter og vi ikke er i auto-sentrert modus på brukeren
    const shouldFit = hasChanged && !isAutoCenter.value
    updateTurpostMarkers(newPosts || [], shouldFit)
    updatePrivateTurpostMarkers(props.privateTurposter || [])
  }
)

watch(
  () => [props.isLoggedIn, props.visitedTurpostIds],
  () => {
    // Rør aldri kartutsnittet når innloggingsstatus eller besøksliste oppdateres (f.eks. ved åpning av profil)
    updateTurpostMarkers(props.turposter || [], false)
    updatePrivateTurpostMarkers(props.privateTurposter || [])
  },
  { deep: true }
)

watch(
  () => props.privateTurposter,
  (newPrivateSpots) => {
    updatePrivateTurpostMarkers(newPrivateSpots || [])
    updateTurpostMarkers(props.turposter || [], false)
  },
  { deep: true }
)

watch(
  () => [props.vessels, props.isAisToggled, props.isZoomSufficient],
  () => {
    aisLayer.updateVesselMarkers(props.vessels, props.isAisToggled, props.isZoomSufficient)
  },
  { deep: true }
)

watch(
  () => [props.showMunicipalities, props.selectedKommuneName],
  () => {
    if (props.showMunicipalities) {
      municipalitiesLayer.loadMunicipalitiesGeoJson(true)
    } else {
      municipalitiesLayer.renderMunicipalitiesLayer(false)
    }
  }
)

onMounted(() => {
  if (!mapContainer.value) return

  // Standard posisjon: Bergen sentrum (eller brukerposisjon hvis tilgjengelig)
  const initialLat = props.userLocation ? props.userLocation.lat : 60.3913
  const initialLng = props.userLocation ? props.userLocation.lng : 5.3221
  const initialZoom = props.userLocation ? 15 : 13

  map = L.map(mapContainer.value, {
    center: [initialLat, initialLng],
    zoom: initialZoom,
    zoomControl: false
  })

  switchLayer(props.activeLayer || 'norgeskart')

  turpostsLayerGroup = L.layerGroup().addTo(map)
  privateTurpostsLayerGroup = L.layerGroup().addTo(map)
  aisLayer.initLayer()

  if (props.userLocation) {
    hasInitiallyCenteredOnUser.value = true
    updateUserMarker(props.userLocation)
  }

  if (props.turposter && props.turposter.length > 0) {
    lastTurpostSignature = props.turposter.map(p => p.id).join(',')
    updateTurpostMarkers(props.turposter, true)
  }

  if (props.privateTurposter && props.privateTurposter.length > 0) {
    updatePrivateTurpostMarkers(props.privateTurposter)
  }

  if (props.vessels && props.vessels.length > 0) {
    aisLayer.updateVesselMarkers(props.vessels, props.isAisToggled, props.isZoomSufficient)
  }

  if (props.showMunicipalities) {
    municipalitiesLayer.loadMunicipalitiesGeoJson(true)
  }

  trackLayer.updateTrackLayer(props.trackPoints, props.trackName, props.trackDistanceMeters)

  map.on('dragstart', () => {
    isAutoCenter.value = false
    emit('map-dragged')
  })

  const updateMapState = () => {
    if (!map) return
    const center = map.getCenter()
    const zoom = map.getZoom()
    const bounds = map.getBounds()

    emit('coordinates-change', {
      lat: center.lat,
      lng: center.lng,
      zoom
    })

    emit('bounds-change', {
      minLat: bounds.getSouth(),
      maxLat: bounds.getNorth(),
      minLng: bounds.getWest(),
      maxLng: bounds.getEast()
    }, zoom)
  }

  map.on('moveend', updateMapState)
  map.on('zoomend', updateMapState)

  // Klikk i kartet for admin-modus eller "Legg til egen turpost"-modus
  map.on('click', (e: L.LeafletMouseEvent) => {
    if (props.isAdmin || props.isAddSpotActive) {
      emit('add-turpost-map-click', { lat: e.latlng.lat, lng: e.latlng.lng })
    }
  })

  updateMapState()
  const handleResize = () => {
    if (map) {
      map.invalidateSize()
    }
  }
  window.addEventListener('resize', handleResize)
  window.addEventListener('orientationchange', handleResize)
  setTimeout(handleResize, 200)
  setTimeout(handleResize, 600)

  emit('map-ready')
})

onUnmounted(() => {
  trackLayer.cleanup()
  aisLayer.cleanup()
  municipalitiesLayer.cleanup()
  if (map) {
    map.remove()
    map = null
  }
})
</script>

<template>
  <div class="map-wrapper">
    <div ref="mapContainer" class="map-view"></div>
    <!-- Admin-modus banner -->
    <div v-if="props.isAdmin" class="admin-map-banner">
      🛠️ Admin-modus &ndash; klikk i kartet for å legge til en turpost
    </div>
  </div>
</template>

<style scoped>
.map-wrapper {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  z-index: 1;
}

.map-view {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
}

.admin-map-banner {
  position: absolute;
  bottom: calc(32px + env(safe-area-inset-bottom, 0px));
  left: 50%;
  transform: translateX(-50%);
  background: rgba(247, 201, 72, 0.92);
  color: #1a1a1a;
  font-size: 0.82rem;
  font-weight: 700;
  padding: 8px 18px;
  border-radius: 24px;
  pointer-events: none;
  z-index: 1000;
  box-shadow: 0 4px 16px rgba(0,0,0,0.25);
  white-space: nowrap;
}

:deep(.track-interactive-line) {
  cursor: pointer !important;
}

:deep(.track-map-tooltip-wrap) {
  background: rgba(15, 23, 42, 0.94) !important;
  border: 1px solid rgba(249, 115, 22, 0.6) !important;
  border-radius: 10px !important;
  padding: 6px 12px !important;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5) !important;
  backdrop-filter: blur(8px) !important;
  color: #f8fafc !important;
}

:deep(.track-map-tooltip-wrap::before) {
  border-top-color: rgba(249, 115, 22, 0.6) !important;
}

:deep(.track-map-tooltip) {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-family: inherit;
}

:deep(.track-map-tooltip strong) {
  font-size: 12px;
  color: #f8fafc;
}

:deep(.track-map-tooltip small) {
  font-size: 10px;
  color: #94a3b8;
  margin-top: 2px;
}

/* Kilometerindikatorer langs GPS-spor */
:deep(.custom-km-marker-pin) {
  width: 0 !important;
  height: 0 !important;
  border: none !important;
  background: transparent !important;
}

:deep(.track-km-pin) {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: auto;
  cursor: pointer;
  user-select: none;
  filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.45));
  transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.15s ease;
  z-index: 500;
}

:deep(.track-km-pin:hover) {
  transform: translateX(-50%) scale(1.12);
  filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.65));
  z-index: 9999 !important;
}

:deep(.track-km-pill) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #0f172a;
  color: #f8fafc;
  border: 1.5px solid #f97316;
  border-radius: 12px;
  padding: 2px 7px;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
}

:deep(.track-km-label) {
  color: #fb923c;
  font-weight: 700;
  letter-spacing: -0.01em;
}

:deep(.track-km-sep) {
  color: #64748b;
  font-size: 8px;
  opacity: 0.8;
}

:deep(.track-km-time) {
  color: #f1f5f9;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

:deep(.track-km-needle) {
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 5px solid #f97316;
  margin-top: -0.5px;
}

/* Tooltip for kilometerindikatorer */
:deep(.track-km-tooltip-wrap) {
  background: rgba(15, 23, 42, 0.96) !important;
  border: 1px solid rgba(249, 115, 22, 0.6) !important;
  border-radius: 10px !important;
  padding: 6px 12px !important;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5) !important;
  backdrop-filter: blur(8px) !important;
  color: #f8fafc !important;
}

:deep(.track-km-tooltip-wrap::before) {
  border-top-color: rgba(249, 115, 22, 0.6) !important;
}

:deep(.track-km-tooltip) {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-family: inherit;
  font-size: 11px;
}

:deep(.km-tt-title) {
  font-size: 12px;
  color: #fb923c;
  margin-bottom: 1px;
}

:deep(.km-tt-row) {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #cbd5e1;
}

:deep(.km-tt-label) {
  color: #94a3b8;
}

:deep(.km-tt-val) {
  color: #f8fafc;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* Animert GPS-pil for avspilling av rute */
:deep(.custom-track-replay-pin) {
  width: 28px !important;
  height: 28px !important;
  border: none !important;
  background: transparent !important;
  pointer-events: none !important;
}

:deep(.track-replay-avatar) {
  width: 28px;
  height: 28px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  transform-origin: 50% 50%;
  pointer-events: none;
  filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.45));
  will-change: transform;
}

:deep(.track-replay-pulse) {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 26px;
  height: 26px;
  margin-top: -13px;
  margin-left: -13px;
  border-radius: 50%;
  background: rgba(2, 132, 199, 0.35);
  border: 1.5px solid rgba(56, 189, 248, 0.75);
  animation: track-replay-pulse-anim 1.5s infinite ease-out;
  pointer-events: none;
}

@keyframes track-replay-pulse-anim {
  0% {
    transform: scale(0.6);
    opacity: 0.95;
  }
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}

:deep(.track-replay-arrow) {
  position: relative;
  z-index: 2;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
}
</style>
