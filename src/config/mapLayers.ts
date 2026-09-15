export interface MapLayerConfig {
  id: string
  name: string
  desc: string
  sortnum: number
  requiresAuth?: boolean
  requiresAdmin?: boolean
}

// Konfigurasjon for kartlag med sorteringstall (sortnum) og tilgangsstyring.
export const MAP_LAYERS: MapLayerConfig[] = [
  {
    id: 'norgeskart',
    name: 'Kartverket Norgeskart',
    desc: 'Offisielt detaljert norgeskart (Kartverket - kun Norge)',
    sortnum: 10,
  },
  {
    id: 'topo',
    name: 'Topografisk (OpenTopoMap)',
    desc: 'Høydekurver og terrengformasjoner',
    sortnum: 20,
  },
  {
    id: 'standard',
    name: 'Standard OpenStreetMap',
    desc: 'Klassisk detaljert verdenskart',
    sortnum: 30,
  },
  {
    id: 'satellite',
    name: 'Satellitt & Flyfoto (Esri)',
    desc: 'Ekte fly- og satellittbilder (Esri)',
    sortnum: 40,
  },
  {
    id: 'tur',
    name: 'Tur- & Sykkelkart (CyclOSM)',
    desc: 'Stier, turruter og terreng',
    sortnum: 50,
  },
  {
    id: 'google_streets',
    name: 'Google Veikart',
    desc: 'Googles klassiske veikart',
    sortnum: 100,
    requiresAuth: true,
    requiresAdmin: true,
  },
  {
    id: 'google_hybrid',
    name: 'Google Satellitt (Hybrid)',
    desc: 'Googles satellittfoto med veinavn og steder',
    sortnum: 110,
    requiresAuth: true,
    requiresAdmin: true,
  },
  {
    id: 'google_terrain',
    name: 'Google Terreng',
    desc: 'Googles terrengkart med høydeforskjeller',
    sortnum: 120,
    requiresAuth: true,
    requiresAdmin: true,
  },
  {
    id: 'kartverket_sjokart',
    name: 'Kartverket Sjøkart',
    desc: 'Offisielt norsk sjøkart med dybder, fyr og merker',
    sortnum: 200,
  },
  {
    id: 'seamap',
    name: 'OpenSeaMap Sjøkart',
    desc: 'Globalt sjøkart med fyr, bøyer og sjømerker',
    sortnum: 210,
  },
]
