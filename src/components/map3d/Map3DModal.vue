<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, useTemplateRef } from 'vue'
import {
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  Popup as MapLibrePopup,
  NavigationControl,
  setWorkerUrl,
  type StyleSpecification
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { RotateCcw, X, Layers, Compass, Mountain } from 'lucide-vue-next'
import {
  FLYOVER_TERRAIN_SOURCE,
  FLYOVER_LAYERS
} from '@/utils/flyoverTileSources'
import { lookupTurpost, type TurpostItem } from '@/composables/useTurposter'
import type { FirebaseCheckinItem } from '@/composables/useAuth'

try {
  setWorkerUrl(workerUrl)
} catch {
  // Ignorer dersom allerede initialisert
}

const props = withDefaults(
  defineProps<{
    isOpen: boolean
    center?: { lat: number; lng: number; zoom?: number } | null
    turposter?: TurpostItem[]
    privateTurposter?: TurpostItem[]
    visitedTurpostIds?: Set<string>
    myCheckins?: FirebaseCheckinItem[]
    mapboxToken: string
  }>(),
  {
    center: null,
    turposter: () => [],
    privateTurposter: () => [],
    visitedTurpostIds: () => new Set<string>(),
    myCheckins: () => []
  }
)

const emit = defineEmits<{
  (e: 'close'): void
}>()

const mapContainer = useTemplateRef<HTMLDivElement>('mapContainer')
const isMapReady = ref(false)
const active3DLayerId = ref<'opentopomap' | 'kartverket' | 'mapbox_satellite' | 'mapbox_outdoors'>('opentopomap')
const terrainExaggeration = ref<number>(1.5)

let map: MapLibreMap | null = null
let markers: MapLibreMarker[] = []

const createMapStyle = (
  layerId: 'opentopomap' | 'kartverket' | 'mapbox_satellite' | 'mapbox_outdoors'
): StyleSpecification => {
  const token = props.mapboxToken

  let tiles: string[]
  let maxzoom = 22
  let tileSize = 512
  let attribution = '&copy; <a href="https://www.mapbox.com" target="_blank">Mapbox</a>'

  if (layerId === 'mapbox_satellite') {
    if (token) {
      tiles = [
        `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/512/{z}/{x}/{y}@2x?access_token=${token}`
      ]
    } else {
      const l = FLYOVER_LAYERS.satellite!
      tiles = l.tiles
      tileSize = 256
      maxzoom = l.maxzoom
      attribution = l.attribution
    }
  } else if (layerId === 'mapbox_outdoors') {
    if (token) {
      tiles = [
        `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/tiles/512/{z}/{x}/{y}@2x?access_token=${token}`
      ]
    } else {
      const l = FLYOVER_LAYERS.standard!
      tiles = l.tiles
      tileSize = 256
      maxzoom = l.maxzoom
      attribution = l.attribution
    }
  } else if (layerId === 'kartverket') {
    const l = FLYOVER_LAYERS.kartverket!
    tiles = l.tiles
    tileSize = 256
    maxzoom = l.maxzoom
    attribution = l.attribution
  } else {
    // OpenTopoMap - samme som i 3D-filmen (Bilde 1)
    const l = FLYOVER_LAYERS.opentopomap!
    tiles = l.tiles
    tileSize = 256
    maxzoom = l.maxzoom
    attribution = l.attribution
  }

  return {
    version: 8,
    sources: {
      'base-raster-source': {
        type: 'raster',
        tiles,
        tileSize,
        maxzoom,
        attribution
      },
      [FLYOVER_TERRAIN_SOURCE.id]: {
        type: 'raster-dem',
        tiles: FLYOVER_TERRAIN_SOURCE.tiles,
        tileSize: FLYOVER_TERRAIN_SOURCE.tileSize,
        encoding: FLYOVER_TERRAIN_SOURCE.encoding,
        maxzoom: FLYOVER_TERRAIN_SOURCE.maxzoom,
        attribution: FLYOVER_TERRAIN_SOURCE.attribution
      }
    },
    layers: [
      {
        id: 'base-raster-layer',
        type: 'raster',
        source: 'base-raster-source',
        minzoom: 0,
        maxzoom: 22
      }
    ],
    terrain: {
      source: FLYOVER_TERRAIN_SOURCE.id,
      exaggeration: terrainExaggeration.value
    }
  }
}

const clearMarkers = () => {
  markers.forEach((m) => m.remove())
  markers = []
}

const renderTurpostMarkers = async () => {
  if (!map) return
  clearMarkers()

  const centerLat = props.center?.lat ?? 60.3913
  const centerLng = props.center?.lng ?? 5.3221

  // 1. Samle alle kjente turposter: offentlige + private
  const allPostsMap = new Map<string, TurpostItem>()

  // Legg til overførte turposter
  props.turposter.forEach((p) => allPostsMap.set(String(p.id), p))

  // Legg til private turposter
  props.privateTurposter.forEach((p) => {
    allPostsMap.set(String(p.id), {
      ...p,
      isPrivate: true
    })
  })

  // 2. Hvis brukeren har besøkte poster i myCheckins / visitedTurpostIds som mangler i allPostsMap:
  const visitedIds = props.visitedTurpostIds || new Set<string>()
  if (visitedIds.size > 0) {
    const missingVisitedIds: string[] = []
    for (const vid of visitedIds) {
      if (!allPostsMap.has(vid)) {
        missingVisitedIds.push(vid)
      }
    }

    if (missingVisitedIds.length > 0) {
      try {
        const resolved = await Promise.all(
          missingVisitedIds.map(async (id) => {
            const chk = props.myCheckins?.find((c) => String(c.turpostId) === id)
            return await lookupTurpost(id, chk?.turpostName)
          })
        )
        resolved.forEach((p) => {
          if (p && !isNaN(p.lat) && !isNaN(p.lng)) {
            allPostsMap.set(String(p.id), p)
          }
        })
      } catch (err) {
        console.warn('[Map3DModal] Kunne ikke slå opp manglende besøkte turposter:', err)
      }
    }
  }

  // 3. Del inn i besøkte og ubesøkte turposter
  const allPostsList = Array.from(allPostsMap.values())

  // Besøkte turposter innenfor et romslig område (~0.85 grader fra senter) skal ALLTID vises
  const visitedPosts = allPostsList.filter((p) => {
    if (!visitedIds.has(String(p.id))) return false
    return Math.abs(p.lat - centerLat) < 0.85 && Math.abs(p.lng - centerLng) < 1.2
  })

  // Ubesøkte turposter i nærområdet (inntil 100 markører)
  const unvisitedPosts = allPostsList
    .filter((p) => {
      if (visitedIds.has(String(p.id))) return false
      return Math.abs(p.lat - centerLat) < 0.45 && Math.abs(p.lng - centerLng) < 0.75
    })
    .slice(0, 100)

  // Rendrer ubesøkte først, deretter besøkte (slik at besøkte har høyere visuell prioritet)
  const postsToRender = [...unvisitedPosts, ...visitedPosts]

  postsToRender.forEach((post) => {
    const isVisited = visitedIds.has(String(post.id))
    const isPrivate = post.isPrivate === true

    const el = document.createElement('div')
    el.className = `map3d-peak-marker ${isVisited ? 'is-visited' : 'is-unvisited'} ${isPrivate ? 'is-private' : ''}`

    let iconText = isVisited ? '✓' : '⛰️'
    if (isPrivate) {
      iconText = isVisited ? '★' : '⭐'
    }

    el.innerHTML = `
      <div class="map3d-pin ${isVisited ? 'is-visited' : ''} ${isPrivate ? 'is-private' : ''}">
        <span class="map3d-pin-icon">${iconText}</span>
      </div>
    `

    const statusBadge = isVisited
      ? `<div class="map3d-status-badge is-visited">✓ Besøkt</div>`
      : isPrivate
        ? `<div class="map3d-status-badge is-private">⭐ Privat turpost</div>`
        : ''

    const popupHtml = `
      <div class="map3d-popup-content">
        ${statusBadge}
        <h4 style="margin: 2px 0 4px; font-size: 13px; font-weight: 700; color: #f8fafc;">${post.name}</h4>
        ${post.alt ? `<div style="font-size: 11px; color: #38bdf8; font-weight: 600;">⛰️ ${post.alt} moh.</div>` : ''}
        <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">
          ${post.lat.toFixed(4)}°, ${post.lng.toFixed(4)}°
        </div>
      </div>
    `

    const popup = new MapLibrePopup({ offset: 20, closeButton: false }).setHTML(popupHtml)

    const marker = new MapLibreMarker({ element: el })
      .setLngLat([post.lng, post.lat])
      .setPopup(popup)
      .addTo(map!)

    markers.push(marker)
  })
}

const init3DMap = () => {
  if (!mapContainer.value) return

  const initialLat = props.center?.lat ?? 60.3913
  const initialLng = props.center?.lng ?? 5.3221
  const initialZoom = Math.max(props.center?.zoom ?? 14.5, 14.2)

  map = new MapLibreMap({
    container: mapContainer.value,
    style: createMapStyle(active3DLayerId.value),
    center: [initialLng, initialLat],
    zoom: initialZoom,
    pitch: 74,
    bearing: 0,
    maxPitch: 85,
    attributionControl: {
      compact: true
    }
  })

  map.addControl(new NavigationControl({ visualizePitch: true }), 'bottom-right')

  let readyHandled = false
  const onReady = () => {
    if (readyHandled || !map) return
    readyHandled = true
    try {
      if (map.setTerrain) {
        map.setTerrain({
          source: FLYOVER_TERRAIN_SOURCE.id,
          exaggeration: terrainExaggeration.value
        })
      }
      renderTurpostMarkers()
    } catch (err) {
      console.warn('[Map3DModal] Feil under aktivering av terreng:', err)
    } finally {
      isMapReady.value = true
    }
  }

  if (typeof map.isStyleLoaded === 'function' && map.isStyleLoaded()) {
    onReady()
  } else {
    map.once('style.load', onReady)
    map.once('load', onReady)
  }

  map.on('error', (err) => {
    console.warn('[Map3DModal] Kartfeil:', err)
  })

  setTimeout(() => {
    if (!readyHandled) {
      onReady()
    }
  }, 1200)
}

const handleLayerChange = (
  layerId: 'opentopomap' | 'kartverket' | 'mapbox_satellite' | 'mapbox_outdoors'
) => {
  active3DLayerId.value = layerId
  if (!map) return

  map.setStyle(createMapStyle(layerId), { diff: false })
  map.once('style.load', () => {
    if (map && map.setTerrain) {
      map.setTerrain({
        source: FLYOVER_TERRAIN_SOURCE.id,
        exaggeration: terrainExaggeration.value
      })
    }
    renderTurpostMarkers()
  })
}

const handleExaggerationChange = (val: number) => {
  terrainExaggeration.value = val
  if (map && map.setTerrain) {
    map.setTerrain({ source: FLYOVER_TERRAIN_SOURCE.id, exaggeration: val })
  }
}

const resetCamera = () => {
  if (!map) return
  map.easeTo({
    pitch: 74,
    bearing: 0,
    duration: 800
  })
}

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && props.isOpen) {
    emit('close')
  }
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      window.addEventListener('keydown', handleKeyDown)
      // Gi DOM-en tid til å rendere beholderen før MapLibre initialiseres
      setTimeout(() => {
        if (!map) {
          init3DMap()
        }
      }, 50)
    } else {
      window.removeEventListener('keydown', handleKeyDown)
      clearMarkers()
      if (map) {
        map.remove()
        map = null
      }
      isMapReady.value = false
    }
  },
  { immediate: true }
)

watch(
  [() => props.turposter, () => props.privateTurposter, () => props.visitedTurpostIds],
  () => {
    if (map && isMapReady.value) {
      renderTurpostMarkers()
    }
  },
  { deep: false }
)

onMounted(() => {
  if (props.isOpen) {
    window.addEventListener('keydown', handleKeyDown)
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  clearMarkers()
  if (map) {
    map.remove()
    map = null
  }
})
</script>

<template>
  <div v-if="isOpen" class="map3d-backdrop" @click.self="emit('close')">
    <div class="map3d-dialog glass-panel">
      <!-- Topplinje med kontroller -->
      <header class="map3d-header">
        <div class="header-left">
          <div class="header-badge">3D Mapbox</div>
          <h2 class="header-title">3D Terrengvisning</h2>
        </div>

        <!-- Kartstiler -->
        <div class="header-center">
          <div class="layer-pill-group">
            <button
              type="button"
              class="pill-btn"
              :class="{ active: active3DLayerId === 'opentopomap' }"
              @click="handleLayerChange('opentopomap')"
              title="OpenTopoMap med høydekoter (som i 3D-filmen)"
            >
              <Mountain :size="14" />
              <span>Topo</span>
            </button>
            <button
              type="button"
              class="pill-btn"
              :class="{ active: active3DLayerId === 'kartverket' }"
              @click="handleLayerChange('kartverket')"
              title="Kartverket Norgeskart (3D)"
            >
              <span>Norgeskart</span>
            </button>
            <button
              type="button"
              class="pill-btn"
              :class="{ active: active3DLayerId === 'mapbox_satellite' }"
              @click="handleLayerChange('mapbox_satellite')"
              title="Mapbox Satellitt (3D)"
            >
              <Layers :size="14" />
              <span>Satellitt</span>
            </button>
            <button
              type="button"
              class="pill-btn"
              :class="{ active: active3DLayerId === 'mapbox_outdoors' }"
              @click="handleLayerChange('mapbox_outdoors')"
              title="Mapbox Friluft (3D)"
            >
              <Compass :size="14" />
              <span>Friluft</span>
            </button>
          </div>

          <!-- Terrengoverdrivelse -->
          <div class="exaggeration-group">
            <span class="exaggeration-label">Høyde:</span>
            <button
              type="button"
              class="exag-btn"
              :class="{ active: terrainExaggeration === 1.2 }"
              @click="handleExaggerationChange(1.2)"
              title="1.2x høyde"
            >
              1.2x
            </button>
            <button
              type="button"
              class="exag-btn"
              :class="{ active: terrainExaggeration === 1.5 }"
              @click="handleExaggerationChange(1.5)"
              title="1.5x høyde (standard)"
            >
              1.5x
            </button>
            <button
              type="button"
              class="exag-btn"
              :class="{ active: terrainExaggeration === 1.8 }"
              @click="handleExaggerationChange(1.8)"
              title="1.8x høyde (tydelige fjell)"
            >
              1.8x
            </button>
            <button
              type="button"
              class="exag-btn"
              :class="{ active: terrainExaggeration === 2.2 }"
              @click="handleExaggerationChange(2.2)"
              title="2.2x høyde (dramatiske fjell)"
            >
              2.2x
            </button>
          </div>
        </div>

        <div class="header-right">
          <button
            type="button"
            class="control-btn"
            @click="resetCamera"
            title="Nullstill vinkel og pek mot nord"
            aria-label="Nullstill vinkel"
          >
            <RotateCcw :size="16" />
            <span class="btn-label">Nord / 74°</span>
          </button>
          <button
            type="button"
            class="btn-close"
            @click="emit('close')"
            title="Lukk 3D-visning (Esc)"
            aria-label="Lukk"
          >
            <X :size="18" />
          </button>
        </div>
      </header>

      <!-- Kartbeholder -->
      <div class="map3d-viewport">
        <div ref="mapContainer" class="map3d-canvas-container"></div>

        <!-- Lasteindikator -->
        <div v-if="!isMapReady" class="map3d-loading-overlay">
          <div class="spinner"></div>
          <span>Laster Mapbox 3D-terreng...</span>
        </div>

        <!-- Hjelpe-tips i bunnen -->
        <div class="map3d-hud-hint">
          <span>💡 Hold <strong>høyre musetast</strong> (eller to fingre på touch) og dra for å rotere og tilte terrenget</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.map3d-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.map3d-dialog {
  position: relative;
  width: 100%;
  height: 100%;
  max-width: 1400px;
  max-height: 920px;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 18px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.9);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.map3d-header {
  height: 56px;
  padding: 0 16px;
  background: #1e293b;
  border-bottom: 1px solid #334155;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  z-index: 10;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-badge {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.15);
  padding: 3px 7px;
  border-radius: 6px;
  border: 1px solid rgba(56, 189, 248, 0.3);
}

.header-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #f8fafc;
}

.header-center {
  display: flex;
  align-items: center;
  gap: 16px;
}

.layer-pill-group,
.exaggeration-group {
  display: flex;
  align-items: center;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 3px;
  gap: 2px;
}

.pill-btn,
.exag-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: all 0.15s ease;
}

.pill-btn:hover,
.exag-btn:hover {
  color: #f8fafc;
  background: #1e293b;
}

.pill-btn.active,
.exag-btn.active {
  background: #0284c7;
  color: #ffffff;
}

.exaggeration-label {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  padding: 0 6px 0 4px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.control-btn {
  background: #0f172a;
  border: 1px solid #334155;
  color: #f8fafc;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s ease;
}

.control-btn:hover {
  background: #1e3a5f;
  border-color: #38bdf8;
}

.btn-close {
  background: #334155;
  border: none;
  color: #cbd5e1;
  padding: 6px 10px;
  border-radius: 8px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.btn-close:hover {
  background: #ef4444;
  color: white;
}

.map3d-viewport {
  position: relative;
  flex: 1;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #0f172a;
}

.map3d-canvas-container {
  width: 100%;
  height: 100%;
}

.map3d-loading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.85);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #f8fafc;
  font-size: 14px;
  font-weight: 600;
  z-index: 20;
}

.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid rgba(56, 189, 248, 0.2);
  border-top-color: #38bdf8;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.map3d-hud-hint {
  position: absolute;
  bottom: 14px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 30px;
  padding: 6px 16px;
  color: #cbd5e1;
  font-size: 11.5px;
  pointer-events: none;
  z-index: 10;
  white-space: nowrap;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}

@media (max-width: 768px) {
  .map3d-backdrop {
    padding: 0;
  }

  .map3d-dialog {
    max-width: 100%;
    max-height: 100%;
    border-radius: 0;
    border: none;
  }

  .map3d-header {
    height: auto;
    padding: 10px;
    flex-wrap: wrap;
  }

  .header-center {
    order: 3;
    width: 100%;
    justify-content: space-between;
  }

  .btn-label {
    display: none;
  }

  .map3d-hud-hint {
    display: none;
  }
}
</style>

<style>
/* Globale stiler for 3D markører og popups i MapLibre */
.map3d-peak-marker {
  cursor: pointer;
  transform: translate(-50%, -50%);
  transition: transform 0.15s ease;
  z-index: 10;
}

.map3d-peak-marker.is-visited {
  z-index: 60;
}

.map3d-peak-marker:hover {
  transform: translate(-50%, -50%) scale(1.25);
  z-index: 100;
}

.map3d-pin {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0284c7, #0369a1);
  color: #ffffff;
  border: 2px solid #ffffff;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.55);
  font-size: 13px;
  font-weight: 700;
  transition: all 0.15s ease;
}

.map3d-pin.is-visited {
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, #10b981, #059669);
  border: 2.5px solid #ecfdf5;
  box-shadow: 0 4px 14px rgba(16, 185, 129, 0.7);
  font-size: 16px;
  font-weight: 900;
  color: #ffffff;
  transform: scale(1.08);
}

.map3d-pin.is-private {
  background: linear-gradient(135deg, #a855f7, #7c3aed);
  border: 2px dashed #ffffff;
  box-shadow: 0 4px 12px rgba(168, 85, 247, 0.55);
}

.map3d-pin.is-private.is-visited {
  background: linear-gradient(135deg, #06b6d4, #0891b2);
  border: 2.5px solid #ffffff;
  box-shadow: 0 4px 14px rgba(6, 182, 212, 0.65);
}

.map3d-pin-icon {
  line-height: 1;
}

.map3d-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 9999px;
  margin-bottom: 4px;
}

.map3d-status-badge.is-visited {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.4);
}

.map3d-status-badge.is-private {
  background: rgba(168, 85, 247, 0.2);
  color: #c084fc;
  border: 1px solid rgba(168, 85, 247, 0.4);
}

.map3d-popup-content {
  background: #0f172a;
  color: #f8fafc;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.85);
  min-width: 130px;
}

.maplibregl-popup-content {
  background: transparent !important;
  box-shadow: none !important;
  padding: 0 !important;
}

.maplibregl-popup-anchor-bottom .maplibregl-popup-tip {
  border-top-color: #0f172a !important;
}
.maplibregl-popup-anchor-top .maplibregl-popup-tip {
  border-bottom-color: #0f172a !important;
}
.maplibregl-popup-anchor-left .maplibregl-popup-tip {
  border-right-color: #0f172a !important;
}
.maplibregl-popup-anchor-right .maplibregl-popup-tip {
  border-left-color: #0f172a !important;
}
</style>
