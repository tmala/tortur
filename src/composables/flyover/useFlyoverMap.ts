import { ref, shallowRef } from 'vue'
import {
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  setWorkerUrl,
  type StyleSpecification,
  type GeoJSONSource,
  type RasterTileSource
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import {
  FLYOVER_LAYERS,
  FLYOVER_TERRAIN_SOURCE,
  DEFAULT_FLYOVER_LAYER_ID,
  type FlyoverTileLayer
} from '@/utils/flyoverTileSources'
import type { FlyoverPath, FlyoverSamplePoint } from '@/utils/flyoverPath'

// Registrer Vite worker URL for MapLibre GL
try {
  setWorkerUrl(workerUrl)
} catch {
  // Ignorer dersom allerede satt
}

export function useFlyoverMap() {
  const mapInstance = shallowRef<MapLibreMap | null>(null)
  const isMapReady = ref(false)
  const activeLayerId = ref<string>(DEFAULT_FLYOVER_LAYER_ID)
  const isTerrainLoaded = ref(false)
  const terrainExaggeration = ref(1.3)

  let avatarMarker: MapLibreMarker | null = null
  let avatarArrowEl: HTMLElement | null = null

  /**
   * Bygger et minimalt MapLibre-stilobjekt med valgt rasterlag og AWS Terrarium DEM.
   */
  const createMapStyle = (layer: FlyoverTileLayer): StyleSpecification => {
    return {
      version: 8,
      sources: {
        'base-raster-source': {
          type: 'raster',
          tiles: layer.tiles,
          tileSize: layer.tileSize || 256,
          maxzoom: layer.maxzoom,
          attribution: layer.attribution
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

  /**
   * Oppretter og konfigurerer kartet i gitt beholder.
   */
  const initMap = (container: HTMLElement, initialPath?: FlyoverPath): Promise<MapLibreMap> => {
    return new Promise((resolve) => {
      const layer = FLYOVER_LAYERS[activeLayerId.value] || FLYOVER_LAYERS[DEFAULT_FLYOVER_LAYER_ID]!

      // Beregn omtrentlig senter fra sporet hvis tilgjengelig
      let initialCenter: [number, number] = [5.33, 60.46]
      if (initialPath && initialPath.points.length > 0) {
        const midPt = initialPath.points[Math.floor(initialPath.points.length / 2)]!
        initialCenter = [midPt.lng, midPt.lat]
      }

      const map = new MapLibreMap({
        container,
        style: createMapStyle(layer),
        center: initialCenter,
        zoom: 14.5,
        pitch: 65,
        bearing: 0,
        maxPitch: 85,
        attributionControl: {
          compact: true
        }
      })

      mapInstance.value = map

      let resolved = false
      const onReady = () => {
        if (resolved) return
        resolved = true
        try {
          setupTrackLayers(map, initialPath)
          createAvatarMarker(map, initialPath)
        } catch (err) {
          console.warn('[FlyoverMap] Feil under oppsett av spor-lag:', err)
        } finally {
          isMapReady.value = true
          isTerrainLoaded.value = true
          resolve(map)
        }
      }

      if (map.isStyleLoaded()) {
        onReady()
      } else {
        // 'style.load' fyrer så snart stilen er lastet og klar for lag/sources (typisk <100ms),
        // i motsetning til 'load' som venter på at ALLE rasterfliser er lastet over nettverket.
        map.once('style.load', onReady)
        map.once('load', onReady)
      }

      map.on('error', (err) => {
        console.warn('[FlyoverMap] Kartfeil:', err)
      })

      // Sikkerhetsventil: Maksimalt 1200ms uansett ekstern nettverkshastighet
      setTimeout(() => {
        if (!resolved) {
          onReady()
        }
      }, 1200)
    })
  }

  /**
   * Oppretter GeoJSON-kilder og linjelag for sporet.
   */
  const setupTrackLayers = (map: MapLibreMap, path?: FlyoverPath) => {
    const fullCoordinates = path && path.points.length >= 2 ? path.points.map((p) => [p.lng, p.lat]) : []

    // 1. Kilde for hele sporet (bakgrunnsspor)
    const existingFullSource = map.getSource('flyover-track-full') as GeoJSONSource | undefined
    if (existingFullSource) {
      existingFullSource.setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: fullCoordinates
        }
      })
    } else {
      map.addSource('flyover-track-full', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: fullCoordinates
          }
        }
      })

      // Skygge-/konturlinje for sporet
      map.addLayer({
        id: 'flyover-track-full-outline',
        type: 'line',
        source: 'flyover-track-full',
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-color': '#000000',
          'line-width': 7,
          'line-opacity': 0.6
        }
      })

      // Grå/halvtransparent stiplet foran markøren (gjenstående rute)
      map.addLayer({
        id: 'flyover-track-full-line',
        type: 'line',
        source: 'flyover-track-full',
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-color': '#94a3b8',
          'line-width': 4,
          'line-dasharray': [2, 1.5],
          'line-opacity': 0.8
        }
      })
    }

    // 2. Kilde for allerede tilbakelagt del av sporet
    const completedCoordinates = fullCoordinates.length >= 2 ? [fullCoordinates[0]!, fullCoordinates[0]!] : []
    const existingCompletedSource = map.getSource('flyover-track-completed') as GeoJSONSource | undefined
    if (existingCompletedSource) {
      existingCompletedSource.setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: completedCoordinates
        }
      })
    } else {
      map.addSource('flyover-track-completed', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: completedCoordinates
          }
        }
      })

      // Glødende / sterk oransje linje bak markøren
      map.addLayer({
        id: 'flyover-track-completed-glow',
        type: 'line',
        source: 'flyover-track-completed',
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-color': '#ea580c',
          'line-width': 8,
          'line-blur': 2,
          'line-opacity': 0.5
        }
      })

      map.addLayer({
        id: 'flyover-track-completed-line',
        type: 'line',
        source: 'flyover-track-completed',
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-color': '#fb923c',
          'line-width': 5,
          'line-opacity': 0.95
        }
      })
    }
  }

  /**
   * Oppretter en 3D-tilpasset avatar-markør med retningspil og puls.
   */
  const createAvatarMarker = (map: MapLibreMap, path?: FlyoverPath) => {
    let initialLngLat: [number, number] = [5.33, 60.46]
    if (path && path.points.length > 0) {
      initialLngLat = [path.points[0]!.lng, path.points[0]!.lat]
    }

    if (avatarMarker) {
      avatarMarker.setLngLat(initialLngLat)
      return
    }

    const container = document.createElement('div')
    container.className = 'flyover-avatar-marker'

    const pulse = document.createElement('div')
    pulse.className = 'flyover-avatar-pulse'

    const body = document.createElement('div')
    body.className = 'flyover-avatar-body'

    const arrow = document.createElement('div')
    arrow.className = 'flyover-avatar-arrow'
    arrow.innerHTML = '▲'
    avatarArrowEl = arrow

    body.appendChild(arrow)
    container.appendChild(pulse)
    container.appendChild(body)

    avatarMarker = new MapLibreMarker({
      element: container,
      anchor: 'center'
    })
      .setLngLat(initialLngLat)
      .addTo(map)
  }

  /**
   * Oppdaterer markørposisjon og den tilbakelagte linjen basert på progress.
   */
  const updateProgress = (currentPoint: FlyoverSamplePoint, path: FlyoverPath) => {
    const map = mapInstance.value
    if (!map || !isMapReady.value) return

    // 1. Oppdater markør
    if (avatarMarker) {
      avatarMarker.setLngLat([currentPoint.lng, currentPoint.lat])
    }
    if (avatarArrowEl) {
      avatarArrowEl.style.transform = `rotate(${Math.round(currentPoint.bearing)}deg)`
    }

    // 2. Oppdater tilbakelagt del av sporet
    const completedSource = map.getSource('flyover-track-completed') as
      | GeoJSONSource
      | undefined

    if (completedSource && path.points.length > 0) {
      const targetDist = currentPoint.distanceMeters
      const completedCoords: [number, number][] = []

      for (const pt of path.points) {
        if (pt.distanceMeters <= targetDist) {
          completedCoords.push([pt.lng, pt.lat])
        } else {
          break
        }
      }
      completedCoords.push([currentPoint.lng, currentPoint.lat])

      if (completedCoords.length >= 2) {
        completedSource.setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: completedCoords
          }
        })
      }
    }
  }

  /**
   * Bytter kartlag sømløst.
   */
  const changeTileLayer = (layerId: string) => {
    if (!FLYOVER_LAYERS[layerId]) return
    activeLayerId.value = layerId
    const layer = FLYOVER_LAYERS[layerId]!
    const map = mapInstance.value
    if (!map || !isMapReady.value) return

    const baseSource = map.getSource('base-raster-source') as RasterTileSource | undefined
    if (baseSource && 'setTiles' in baseSource) {
      // MapLibre støtter dynamisk setTiles på raster-kilder
      ;(baseSource as { setTiles: (tiles: string[]) => void }).setTiles(layer.tiles)
    } else {
      // Fallback: oppdater style med bevaring av terreng
      const center = map.getCenter()
      const zoom = map.getZoom()
      const pitch = map.getPitch()
      const bearing = map.getBearing()

      map.setStyle(createMapStyle(layer))
      map.once('style.load', () => {
        map.setCenter(center)
        map.setZoom(zoom)
        map.setPitch(pitch)
        map.setBearing(bearing)
      })
    }
  }

  /**
   * Tilpasser visningen slik at hele sporet er synlig.
   */
  const fitTrackBounds = (path: FlyoverPath) => {
    const map = mapInstance.value
    if (!map || path.points.length < 2) return

    let minLng = Infinity
    let maxLng = -Infinity
    let minLat = Infinity
    let maxLat = -Infinity

    for (const pt of path.points) {
      if (pt.lng < minLng) minLng = pt.lng
      if (pt.lng > maxLng) maxLng = pt.lng
      if (pt.lat < minLat) minLat = pt.lat
      if (pt.lat > maxLat) maxLat = pt.lat
    }

    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat]
      ],
      {
        padding: { top: 70, bottom: 120, left: 50, right: 50 },
        pitch: 45,
        animate: true,
        duration: 1200
      }
    )
  }

  /**
   * Setter overdrivelse av terreng (1.0 til 2.5).
   */
  const setTerrainExaggeration = (val: number) => {
    terrainExaggeration.value = Math.max(0.5, Math.min(3.0, val))
    const map = mapInstance.value
    if (map && isMapReady.value) {
      map.setTerrain({
        source: FLYOVER_TERRAIN_SOURCE.id,
        exaggeration: terrainExaggeration.value
      })
    }
  }

  const cleanup = () => {
    if (avatarMarker) {
      avatarMarker.remove()
      avatarMarker = null
    }
    if (mapInstance.value) {
      mapInstance.value.remove()
      mapInstance.value = null
    }
    isMapReady.value = false
    isTerrainLoaded.value = false
  }

  return {
    mapInstance,
    isMapReady,
    activeLayerId,
    isTerrainLoaded,
    terrainExaggeration,
    initMap,
    updateProgress,
    changeTileLayer,
    setupTrackLayers,
    createAvatarMarker,
    fitTrackBounds,
    setTerrainExaggeration,
    cleanup
  }
}
