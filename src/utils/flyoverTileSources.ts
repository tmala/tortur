export interface FlyoverTileLayer {
  id: string
  name: string
  attribution: string
  tiles: string[]
  maxzoom: number
  tileSize?: number
}

export const FLYOVER_TERRAIN_SOURCE = {
  id: 'aws-terrain',
  type: 'raster-dem' as const,
  tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
  tileSize: 256,
  encoding: 'terrarium' as const,
  maxzoom: 15,
  attribution: 'Terrengdata © AWS Open Data, SRTM, GMTED2010'
}

export const FLYOVER_LAYERS: Record<string, FlyoverTileLayer> = {
  opentopomap: {
    id: 'opentopomap',
    name: 'OpenTopoMap (Terreng)',
    attribution: 'Kartdata: © OpenStreetMap, SRTM | Visning: © OpenTopoMap',
    tiles: [
      'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
      'https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
      'https://c.tile.opentopomap.org/{z}/{x}/{y}.png'
    ],
    maxzoom: 17,
    tileSize: 256
  },
  kartverket: {
    id: 'kartverket',
    name: 'Kartverket (Norgeskart)',
    attribution: '© Kartverket',
    tiles: ['https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png'],
    maxzoom: 18,
    tileSize: 256
  },
  satellite: {
    id: 'satellite',
    name: 'Satellitt (Esri)',
    attribution: 'Tiles © Esri',
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    ],
    maxzoom: 19,
    tileSize: 256
  },
  standard: {
    id: 'standard',
    name: 'OpenStreetMap',
    attribution: '© OpenStreetMap bidragsytere',
    tiles: [
      'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
      'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
      'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
    ],
    maxzoom: 19,
    tileSize: 256
  }
}

export const DEFAULT_FLYOVER_LAYER_ID = 'opentopomap'
