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
}>()

const emit = defineEmits<{
  (e: 'map-dragged'): void
  (e: 'map-ready'): void
  (e: 'coordinates-change', coords: { lat: number; lng: number; zoom: number }): void
  (e: 'bounds-change', bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }, zoom: number): void
  (e: 'select-turpost', post: TurpostItem): void
  (e: 'checkin-turpost', post: TurpostItem): void
  (e: 'view-checkins', post: TurpostItem): void
  (e: 'select-kommune-by-name', name: string): void
  (e: 'clear-turposter'): void
  (e: 'admin-map-click', coords: { lat: number; lng: number }): void
}>()

const mapContainer = ref<HTMLElement | null>(null)
let map: L.Map | null = null
let userMarker: L.Marker | null = null
let accuracyCircle: L.Circle | null = null
let currentTileLayer: L.TileLayer | null = null
let currentOverlayLayer: L.TileLayer | null = null
let turpostsLayerGroup: L.LayerGroup | null = null
let vesselsLayerGroup: L.LayerGroup | null = null
let geoJsonLayer: L.GeoJSON | null = null
let geoJsonData: any = null
const markerMap = new Map<string, L.Marker>()

// Definisjoner av 100% gratis kartlag uten API-nøkkel
const tileLayers: Record<string, { url: string; overlayUrl?: string; attribution: string; maxZoom: number; subdomains?: string }> = {
  standard: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> bidragsytere',
    maxZoom: 19,
    subdomains: 'abc'
  },
  norgeskart: {
    url: 'https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png',
    attribution: '&copy; <a href="https://www.kartverket.no" target="_blank">Kartverket</a>',
    maxZoom: 18
  },
  kartverket_sjokart: {
    url: 'https://cache.kartverket.no/v1/wmts/1.0.0/sjokartraster/default/webmercator/{z}/{y}/{x}.png',
    attribution: '&copy; <a href="https://www.kartverket.no" target="_blank">Kartverket Sjødivisjonen</a>',
    maxZoom: 18
  },
  tur: {
    url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.cyclosm.org" target="_blank">CyclOSM</a> | Kartdata: &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
    maxZoom: 18,
    subdomains: 'abc'
  },
  topo: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Kartdata: &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>, SRTM | Visning: &copy; <a href="https://opentopomap.org" target="_blank">OpenTopoMap</a>',
    maxZoom: 17,
    subdomains: 'abc'
  },
  seamap: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    overlayUrl: 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> | Sjømerker: &copy; <a href="http://www.openseamap.org" target="_blank">OpenSeaMap</a>',
    maxZoom: 18,
    subdomains: 'abc'
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 19
  },
  google_streets: {
    url: 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    attribution: '&copy; <a href="https://maps.google.com" target="_blank">Google Maps</a>',
    maxZoom: 20,
    subdomains: '0123'
  },
  google_hybrid: {
    url: 'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    attribution: '&copy; <a href="https://maps.google.com" target="_blank">Google Maps</a>',
    maxZoom: 20,
    subdomains: '0123'
  },
  google_terrain: {
    url: 'https://mt{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',
    attribution: '&copy; <a href="https://maps.google.com" target="_blank">Google Maps</a>',
    maxZoom: 20,
    subdomains: '0123'
  }
}

const createUserIcon = (heading: number | null) => {
  const headingStyle = heading !== null 
    ? `transform: rotate(${heading}deg); display: block;` 
    : 'display: none;'

  return L.divIcon({
    className: 'custom-user-pin',
    html: `
      <div class="user-location-marker">
        <div class="pulse-ring"></div>
        <div class="marker-core"></div>
        <div class="heading-indicator" style="${headingStyle}"></div>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22]
  })
}

const createTurpostIcon = (isVisited: boolean = false) => {
  return L.divIcon({
    className: 'custom-turpost-pin',
    html: `
      <div class="turpost-pin-marker ${isVisited ? 'is-visited' : 'is-unvisited'}">
        <div class="turpost-pin-icon">
          <span>${isVisited ? '✓' : '⛰️'}</span>
        </div>
      </div>
    `,
    iconSize: [32, 38],
    iconAnchor: [16, 36],
    popupAnchor: [0, -32]
  })
}

const switchLayer = (layerKey: string) => {
  if (!map) return

  const config = tileLayers[layerKey] ?? tileLayers.standard!
  if (!config) return

  if (currentTileLayer) {
    map.removeLayer(currentTileLayer)
    currentTileLayer = null
  }

  if (currentOverlayLayer) {
    map.removeLayer(currentOverlayLayer)
    currentOverlayLayer = null
  }

  currentTileLayer = L.tileLayer(config.url, {
    attribution: config.attribution,
    maxZoom: config.maxZoom,
    subdomains: config.subdomains || 'abc',
    updateWhenIdle: true,
    updateWhenZooming: false,
    keepBuffer: 2
  }).addTo(map)

  if (config.overlayUrl) {
    currentOverlayLayer = L.tileLayer(config.overlayUrl, {
      maxZoom: config.maxZoom,
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 2
    }).addTo(map)
  }
}

const updateUserMarker = (loc: GeoLocationState | null) => {
  if (!map || !loc) return

  const latLng: L.LatLngExpression = [loc.lat, loc.lng]

  if (!userMarker) {
    userMarker = L.marker(latLng, {
      icon: createUserIcon(loc.heading),
      zIndexOffset: 1000
    }).addTo(map)

    userMarker.bindPopup(`
      <div style="font-family: inherit; font-size: 13px; color: #f8fafc; line-height: 1.4;">
        <strong style="color: #38bdf8;">Du er her</strong><br/>
        Lat: ${loc.lat.toFixed(5)}<br/>
        Lng: ${loc.lng.toFixed(5)}<br/>
        ${loc.accuracy ? `Nøyaktighet: ±${Math.round(loc.accuracy)} meter` : ''}
      </div>
    `)
  } else {
    userMarker.setLatLng(latLng)
    userMarker.setIcon(createUserIcon(loc.heading))
    userMarker.setPopupContent(`
      <div style="font-family: inherit; font-size: 13px; color: #f8fafc; line-height: 1.4;">
        <strong style="color: #38bdf8;">Du er her</strong><br/>
        Lat: ${loc.lat.toFixed(5)}<br/>
        Lng: ${loc.lng.toFixed(5)}<br/>
        ${loc.accuracy ? `Nøyaktighet: ±${Math.round(loc.accuracy)} meter` : ''}
      </div>
    `)
  }

  if (loc.accuracy && loc.accuracy > 0) {
    if (!accuracyCircle) {
      accuracyCircle = L.circle(latLng, {
        radius: loc.accuracy,
        color: '#0284c7',
        fillColor: '#38bdf8',
        fillOpacity: 0.15,
        weight: 1.5,
        dashArray: '4, 4'
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

    const marker = L.marker(latLng, {
      icon: createTurpostIcon(isVisited),
      title: post.name,
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

// Kommunegrenser GeoJSON håndtering
const loadMunicipalitiesGeoJson = async () => {
  if (geoJsonData) return
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/kommuner.geojson`)
    if (!res.ok) return
    geoJsonData = await res.json()
    renderMunicipalitiesLayer()
  } catch (err) {
    console.warn('Kunne ikke laste kommunegrenser:', err)
  }
}

const getKommuneStyle = (feature: any) => {
  const name = feature?.properties?.kommunenavn || feature?.properties?.name || ''
  const isSelected = props.selectedKommuneName && 
    name.toLowerCase() === props.selectedKommuneName.toLowerCase()

  if (isSelected) {
    return {
      color: '#10b981',
      weight: 3,
      opacity: 0.9,
      fillColor: '#10b981',
      fillOpacity: 0.14
    }
  }

  return {
    color: '#0284c7',
    weight: 1.5,
    opacity: 0.45,
    fillColor: '#0284c7',
    fillOpacity: 0.02
  }
}

const openKommunePopup = (name: string, latlng: L.LatLng) => {
  if (!map) return

  const info = props.getKommuneInfo ? props.getKommuneInfo(name) : null
  const isCurrentlySelected = props.selectedKommuneName && 
    props.selectedKommuneName.toLowerCase() === name.toLowerCase()

  const countText = info ? `${info.count} turposter registrert` : ''
  const fylkeText = info ? `${info.fylkeName}` : ''

  const popupDiv = document.createElement('div')
  popupDiv.className = 'kommune-action-popup'
  popupDiv.innerHTML = `
    <div style="font-family: inherit; font-size: 13px; color: #f8fafc; min-width: 200px;">
      <h4 style="font-size: 15px; font-weight: 700; margin: 0 0 4px 0; color: #38bdf8;">
        📍 ${name} kommune
      </h4>
      ${fylkeText ? `<div style="font-size: 12px; color: #94a3b8; margin-bottom: 6px;">${fylkeText} ${countText ? `&bull; ${countText}` : ''}</div>` : ''}
      <div style="margin-top: 10px;">
        ${isCurrentlySelected 
          ? `<button id="btn-popup-toggle" class="btn-popup-toggle btn-popup-hide">✕ Skjul turposter</button>`
          : `<button id="btn-popup-toggle" class="btn-popup-toggle btn-popup-show">⛰️ Vis turposter for ${name}</button>`
        }
      </div>
    </div>
  `

  const popup = L.popup({
    className: 'custom-kommune-dialog',
    offset: [0, -10]
  })
    .setLatLng(latlng)
    .setContent(popupDiv)
    .openOn(map)

  const btn = popupDiv.querySelector('#btn-popup-toggle')
  if (btn) {
    btn.addEventListener('click', () => {
      if (isCurrentlySelected) {
        emit('clear-turposter')
      } else {
        emit('select-kommune-by-name', name)
      }
      map?.closePopup(popup)
    })
  }
}

const renderMunicipalitiesLayer = () => {
  if (!map || !geoJsonData) return

  if (geoJsonLayer) {
    map.removeLayer(geoJsonLayer)
    geoJsonLayer = null
  }

  if (!props.showMunicipalities) return

  geoJsonLayer = L.geoJSON(geoJsonData, {
    style: getKommuneStyle,
    onEachFeature: (feature, layer) => {
      const name = feature.properties?.kommunenavn || feature.properties?.name || 'Kommune'

      layer.on({
        mouseover: (e) => {
          const targetLayer = e.target
          targetLayer.setStyle({
            color: '#38bdf8',
            weight: 2.5,
            opacity: 0.9,
            fillColor: '#38bdf8',
            fillOpacity: 0.1
          })
          targetLayer.bringToFront()
        },
        mouseout: (e) => {
          if (geoJsonLayer) {
            geoJsonLayer.resetStyle(e.target)
          }
        },
        click: (e) => {
          openKommunePopup(name, e.latlng)
        }
      })
    }
  }).addTo(map)

  geoJsonLayer.bringToBack()
}

const isAutoCenter = ref(true)

const centerOnUser = (animate = true, zoomLevel?: number) => {
  if (!map || !props.userLocation) return
  isAutoCenter.value = true

  const targetZoom = zoomLevel ?? Math.max(map.getZoom(), 16)
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

let trackPolyline: L.Polyline | null = null
let trackBgPolyline: L.Polyline | null = null

const updateTrackLayer = () => {
  if (!map) return
  const points = props.trackPoints || []
  if (points.length < 2) {
    if (trackPolyline) {
      trackPolyline.remove()
      trackPolyline = null
    }
    if (trackBgPolyline) {
      trackBgPolyline.remove()
      trackBgPolyline = null
    }
    return
  }

  const latlngs = points.map(p => [p.lat, p.lng] as [number, number])

  if (!trackPolyline || !trackBgPolyline) {
    trackBgPolyline = L.polyline(latlngs, {
      color: '#0f172a',
      weight: 6,
      opacity: 0.55,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(map)

    trackPolyline = L.polyline(latlngs, {
      color: '#f97316',
      weight: 3.5,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(map)
  } else {
    trackBgPolyline.setLatLngs(latlngs)
    trackPolyline.setLatLngs(latlngs)
  }
}

watch(
  () => props.trackPoints,
  () => {
    updateTrackLayer()
  },
  { deep: true }
)

const flyToPost = (post: TurpostItem) => {
  if (!map) return

  map.flyTo([post.lat, post.lng], Math.max(map.getZoom(), 15), {
    duration: 1.0,
    easeLinearity: 0.25
  })

  const marker = markerMap.get(post.id)
  if (marker) {
    setTimeout(() => {
      marker.openPopup()
    }, 400)
  }
}

const panToCoordinate = (lat: number, lng: number, zoomLevel?: number) => {
  if (!map) return
  const targetZoom = zoomLevel ?? Math.max(map.getZoom(), 14)
  map.flyTo([lat, lng], targetZoom, {
    duration: 1.2,
    easeLinearity: 0.25
  })
}

defineExpose({
  centerOnUser,
  flyToPost,
  panToCoordinate,
  getMapInstance: () => map
})

watch(
  () => props.userLocation,
  (newLoc) => {
    if (newLoc) {
      updateUserMarker(newLoc)
      if (props.isTracking && isAutoCenter.value && map) {
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

const createVesselIcon = (vessel: AisVessel) => {
  let color = '#38bdf8' // Blue passenger / ferry
  if (vessel.shipCategory === 'cargo') color = '#22c55e' // Green cargo
  else if (vessel.shipCategory === 'tanker') color = '#eab308' // Yellow/Gold tanker
  else if (vessel.shipCategory === 'tug') color = '#f97316' // Orange tug
  else if (vessel.shipCategory === 'rescue') color = '#ef4444' // Red rescue/coast guard
  else if (vessel.shipCategory === 'fishing') color = '#a855f7' // Purple fishing vessel
  else if (vessel.shipCategory === 'military') color = '#4d7c0f' // Olive green military
  else if (vessel.shipCategory === 'other') color = '#94a3b8'

  const rot = vessel.heading ?? vessel.cog ?? 0

  return L.divIcon({
    className: 'custom-vessel-pin',
    html: `
      <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; transform: rotate(${rot}deg); transition: transform 0.3s ease;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="${color}" stroke="#0f172a" stroke-width="1.5">
          <path d="M12 2 L19 19 L12 16 L5 19 Z" />
        </svg>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
  })
}

const updateVesselMarkers = (ships: AisVessel[] | undefined) => {
  if (!map || !vesselsLayerGroup) return
  vesselsLayerGroup.clearLayers()
  if (!props.isAisToggled || !props.isZoomSufficient || !ships || ships.length === 0) {
    return
  }

  const categoryLabels: Record<string, string> = {
    passenger: 'Passasjerskip / Ferge',
    cargo: 'Lasteskip',
    tanker: 'Tankskip',
    tug: 'Slepebåt / Arbeidsfartøy',
    rescue: 'Redning / Kystvakt',
    fishing: 'Fiskefartøy',
    military: 'Militært fartøy (Marine)',
    other: 'Fartøy'
  }

  ships.forEach((ship) => {
    const marker = L.marker([ship.lat, ship.lng], {
      icon: createVesselIcon(ship),
      zIndexOffset: 800
    })

    const isMilitary = ship.shipCategory === 'military'
    const shipEmoji = isMilitary ? '🛡️' : '🚢'
    const nameColor = isMilitary ? '#86efac' : '#38bdf8'

    marker.bindPopup(`
      <div style="font-family: inherit; font-size: 13px; color: #f8fafc; line-height: 1.4; min-width: 200px;">
        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
          <span style="font-size: 16px;">${shipEmoji}</span>
          <strong style="color: ${nameColor}; font-size: 14px;">${ship.name}</strong>
        </div>
        <div style="color: #94a3b8; font-size: 11px; margin-bottom: 6px;">
          ${ship.shipType || categoryLabels[ship.shipCategory] || 'Fartøy'} &bull; MMSI: ${ship.mmsi}
        </div>
        <div style="background: rgba(15, 23, 42, 0.6); padding: 6px 8px; border-radius: 6px; font-size: 12px; margin-bottom: 6px; display: flex; flex-direction: column; gap: 3px;">
          <div>💨 <strong>Fart:</strong> ${ship.sog.toFixed(1)} knop</div>
          <div>🧭 <strong>Kurs:</strong> ${Math.round(ship.cog)}°</div>
          ${ship.navStatus ? `<div>⚓ <strong>Status:</strong> ${ship.navStatus}</div>` : ''}
          ${ship.destination ? `<div>📍 <strong>Destinasjon:</strong> ${ship.destination}</div>` : ''}
        </div>
        <div style="font-size: 10px; color: #64748b; text-align: right;">
          Oppdatert: ${ship.updatedAt}
        </div>
      </div>
    `, {
      className: 'custom-turpost-popup'
    })

    vesselsLayerGroup!.addLayer(marker)
  })
}

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

    // Tilpass kun kartutsnittet hvis det faktisk kom et nytt utvalg av turposter
    updateTurpostMarkers(newPosts || [], hasChanged)
  }
)

watch(
  () => [props.isLoggedIn, props.visitedTurpostIds],
  () => {
    // Rør aldri kartutsnittet når innloggingsstatus eller besøksliste oppdateres (f.eks. ved åpning av profil)
    updateTurpostMarkers(props.turposter || [], false)
  },
  { deep: true }
)

watch(
  () => [props.vessels, props.isAisToggled, props.isZoomSufficient],
  () => {
    updateVesselMarkers(props.vessels)
  },
  { deep: true }
)

watch(
  () => [props.showMunicipalities, props.selectedKommuneName],
  () => {
    if (props.showMunicipalities) {
      loadMunicipalitiesGeoJson().then(() => {
        renderMunicipalitiesLayer()
      })
    } else if (geoJsonLayer && map) {
      map.removeLayer(geoJsonLayer)
      geoJsonLayer = null
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

  L.control.zoom({ position: 'topright' }).addTo(map)

  switchLayer(props.activeLayer || 'norgeskart')

  turpostsLayerGroup = L.layerGroup().addTo(map)
  vesselsLayerGroup = L.layerGroup().addTo(map)

  if (props.userLocation) {
    updateUserMarker(props.userLocation)
  }

  if (props.turposter && props.turposter.length > 0) {
    lastTurpostSignature = props.turposter.map(p => p.id).join(',')
    updateTurpostMarkers(props.turposter, true)
  }

  if (props.vessels && props.vessels.length > 0) {
    updateVesselMarkers(props.vessels)
  }

  if (props.showMunicipalities) {
    loadMunicipalitiesGeoJson()
  }

  updateTrackLayer()

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

  // Admin-modus: klikk i kartet oppretter ny turpost
  map.on('click', (e: L.LeafletMouseEvent) => {
    if (props.isAdmin) {
      emit('admin-map-click', { lat: e.latlng.lat, lng: e.latlng.lng })
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
  if (trackPolyline) {
    trackPolyline.remove()
    trackPolyline = null
  }
  if (trackBgPolyline) {
    trackBgPolyline.remove()
    trackBgPolyline = null
  }
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
</style>
