<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import L from 'leaflet'
import type { GeoLocationState } from '@/composables/useGeolocation'
import type { TurpostItem } from '@/composables/useTurposter'

const props = defineProps<{
  userLocation: GeoLocationState | null
  activeLayer: string
  isTracking: boolean
  turposter: TurpostItem[]
  showMunicipalities: boolean
  selectedKommuneName: string | null
  getKommuneInfo?: (name: string) => { fylkeName: string; count: number } | null
}>()

const emit = defineEmits<{
  (e: 'map-dragged'): void
  (e: 'map-ready'): void
  (e: 'coordinates-change', coords: { lat: number; lng: number; zoom: number }): void
  (e: 'select-turpost', post: TurpostItem): void
  (e: 'select-kommune-by-name', name: string): void
  (e: 'clear-turposter'): void
}>()

const mapContainer = ref<HTMLElement | null>(null)
let map: L.Map | null = null
let userMarker: L.Marker | null = null
let accuracyCircle: L.Circle | null = null
let currentTileLayer: L.TileLayer | null = null
let turpostsLayerGroup: L.LayerGroup | null = null
let geoJsonLayer: L.GeoJSON | null = null
let geoJsonData: any = null
const markerMap = new Map<string, L.Marker>()

// Definisjoner av 100% gratis kartlag uten API-nøkkel
const tileLayers: Record<string, { url: string; attribution: string; maxZoom: number; subdomains?: string }> = {
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
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 19
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

const createTurpostIcon = () => {
  return L.divIcon({
    className: 'custom-turpost-pin',
    html: `
      <div class="turpost-pin-marker">
        <div class="turpost-pin-icon">
          <span>⛰️</span>
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
  }

  currentTileLayer = L.tileLayer(config.url, {
    attribution: config.attribution,
    maxZoom: config.maxZoom,
    subdomains: config.subdomains || 'abc'
  }).addTo(map)
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

const updateTurpostMarkers = (posts: TurpostItem[]) => {
  if (!map || !turpostsLayerGroup) return

  turpostsLayerGroup.clearLayers()
  markerMap.clear()

  if (posts.length === 0) return

  const bounds = L.latLngBounds([])

  posts.forEach(post => {
    const latLng: L.LatLngTuple = [post.lat, post.lng]
    bounds.extend(latLng)

    const marker = L.marker(latLng, {
      icon: createTurpostIcon(),
      title: post.name,
      zIndexOffset: 500
    })

    const popupHtml = `
      <div class="turpost-popup">
        <h4>${post.name}</h4>
        ${post.alt ? `<div class="popup-badge">⛰️ ${post.alt} moh.</div>` : ''}
        <div class="popup-info">
          Posisjon: ${post.lat.toFixed(5)}°, ${post.lng.toFixed(5)}°
        </div>
      </div>
    `

    marker.bindPopup(popupHtml)
    marker.on('click', () => {
      emit('select-turpost', post)
    })

    marker.addTo(turpostsLayerGroup!)
    markerMap.set(post.id, marker)
  })

  // Sentrer og tilpass kartet automatisk til alle postene i kommunen
  if (bounds.isValid()) {
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
    const res = await fetch('/data/kommuner.geojson')
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

const centerOnUser = (animate = true, zoomLevel?: number) => {
  if (!map || !props.userLocation) return

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

defineExpose({
  centerOnUser,
  flyToPost,
  getMapInstance: () => map
})

watch(
  () => props.userLocation,
  (newLoc) => {
    if (newLoc) {
      updateUserMarker(newLoc)
      if (props.isTracking && map) {
        map.panTo([newLoc.lat, newLoc.lng], { animate: true, duration: 0.5 })
      }
    }
  },
  { deep: true }
)

watch(
  () => props.activeLayer,
  (newLayer) => {
    switchLayer(newLayer)
  }
)

watch(
  () => props.turposter,
  (newPosts) => {
    updateTurpostMarkers(newPosts)
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

  switchLayer(props.activeLayer || 'standard')

  turpostsLayerGroup = L.layerGroup().addTo(map)

  if (props.userLocation) {
    updateUserMarker(props.userLocation)
  }

  if (props.turposter && props.turposter.length > 0) {
    updateTurpostMarkers(props.turposter)
  }

  if (props.showMunicipalities) {
    loadMunicipalitiesGeoJson()
  }

  map.on('dragstart', () => {
    emit('map-dragged')
  })

  const updateCenterInfo = () => {
    if (!map) return
    const center = map.getCenter()
    emit('coordinates-change', {
      lat: center.lat,
      lng: center.lng,
      zoom: map.getZoom()
    })
  }

  map.on('moveend', updateCenterInfo)
  map.on('zoomend', updateCenterInfo)

  updateCenterInfo()
  emit('map-ready')
})

onUnmounted(() => {
  if (map) {
    map.remove()
    map = null
  }
})
</script>

<template>
  <div class="map-wrapper">
    <div ref="mapContainer" class="map-view"></div>
  </div>
</template>

<style scoped>
.map-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  z-index: 1;
}

.map-view {
  width: 100%;
  height: 100%;
}
</style>
