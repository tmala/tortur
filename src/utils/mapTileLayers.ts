import L from 'leaflet'

export interface TileLayerConfig {
  url: string
  overlayUrl?: string
  attribution: string
  maxZoom: number
  subdomains?: string
  tileSize?: number
  zoomOffset?: number
}

// Definisjoner av 100% gratis kartlag uten API-nøkkel samt Mapbox/Google admin-lag
export const tileLayers: Record<string, TileLayerConfig> = {
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
  kartverket_graatone: {
    url: 'https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png',
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
  },
  mapbox_outdoors: {
    url: 'https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/tiles/512/{z}/{x}/{y}@2x?access_token={accessToken}',
    attribution: '&copy; <a href="https://www.mapbox.com/about/maps/" target="_blank">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
    maxZoom: 22,
    tileSize: 512,
    zoomOffset: -1
  },
  mapbox_satellite_streets: {
    url: 'https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/512/{z}/{x}/{y}@2x?access_token={accessToken}',
    attribution: '&copy; <a href="https://www.mapbox.com/about/maps/" target="_blank">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
    maxZoom: 22,
    tileSize: 512,
    zoomOffset: -1
  },
  mapbox_streets: {
    url: 'https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/512/{z}/{x}/{y}@2x?access_token={accessToken}',
    attribution: '&copy; <a href="https://www.mapbox.com/about/maps/" target="_blank">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
    maxZoom: 22,
    tileSize: 512,
    zoomOffset: -1
  },
  carto_voyager: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key={cartoKey}',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> bidragsytere &copy; <a href="https://carto.com/attributions" target="_blank">CARTO</a>',
    maxZoom: 20,
    subdomains: 'abcd'
  },
  carto_positron: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png?key={cartoKey}',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> bidragsytere &copy; <a href="https://carto.com/attributions" target="_blank">CARTO</a>',
    maxZoom: 20,
    subdomains: 'abcd'
  },
  carto_dark_matter: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?key={cartoKey}',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> bidragsytere &copy; <a href="https://carto.com/attributions" target="_blank">CARTO</a>',
    maxZoom: 20,
    subdomains: 'abcd'
  }
}

export interface CreateTileLayersOptions {
  mapboxToken?: string
  cartoApiKey?: string
}

export function createTileLayers(
  layerKey: string,
  options?: CreateTileLayersOptions
): {
  baseLayer: L.TileLayer
  overlayLayer: L.TileLayer | null
} {
  let targetKey = layerKey
  if (targetKey.startsWith('mapbox_') && !options?.mapboxToken) {
    targetKey = 'standard'
  }
  if (targetKey.startsWith('carto_') && !options?.cartoApiKey) {
    targetKey = 'standard'
  }

  const config = tileLayers[targetKey] ?? tileLayers.standard!

  let url = config.url
  if (options?.mapboxToken) {
    url = url.replace('{accessToken}', encodeURIComponent(options.mapboxToken))
  }
  if (options?.cartoApiKey) {
    url = url.replace('{cartoKey}', encodeURIComponent(options.cartoApiKey))
  }

  const layerOptions: L.TileLayerOptions = {
    attribution: config.attribution,
    maxZoom: config.maxZoom,
    subdomains: config.subdomains || 'abc',
    updateWhenIdle: true,
    updateWhenZooming: false,
    keepBuffer: 2
  }

  if (config.tileSize) {
    layerOptions.tileSize = config.tileSize
  }
  if (config.zoomOffset !== undefined) {
    layerOptions.zoomOffset = config.zoomOffset
  }

  const baseLayer = L.tileLayer(url, layerOptions)

  let overlayLayer: L.TileLayer | null = null
  if (config.overlayUrl) {
    overlayLayer = L.tileLayer(config.overlayUrl, {
      maxZoom: config.maxZoom,
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 2,
      ...(config.tileSize ? { tileSize: config.tileSize } : {}),
      ...(config.zoomOffset !== undefined ? { zoomOffset: config.zoomOffset } : {})
    })
  }

  return { baseLayer, overlayLayer }
}
