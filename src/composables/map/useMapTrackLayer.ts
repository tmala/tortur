import L from 'leaflet'
import { type TrackPoint, formatDistance } from '@/composables/useGeolocation'

const escapeTrackHtml = (str: string): string => {
  return str.replace(/[&<>"']/g, (m) => {
    switch (m) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      case "'": return '&#39;'
      default: return m
    }
  })
}

export function useMapTrackLayer(
  getMap: () => L.Map | null,
  onClickTrack: () => void
) {
  let trackPolyline: L.Polyline | null = null
  let trackBgPolyline: L.Polyline | null = null
  let trackHitPolyline: L.Polyline | null = null

  const getTrackTooltipContent = (trackName?: string, trackDistanceMeters?: number) => {
    const name = trackName || 'GPS-spor'
    const distStr = trackDistanceMeters ? ` (${formatDistance(trackDistanceMeters)})` : ''
    return `<div class="track-map-tooltip"><strong>${escapeTrackHtml(name)}${distStr}</strong><small>Klikk for å åpne sporinfo</small></div>`
  }

  const onTrackClick = (e: L.LeafletMouseEvent) => {
    L.DomEvent.stopPropagation(e)
    onClickTrack()
  }

  const updateTrackLayer = (
    points: TrackPoint[] | undefined,
    trackName?: string,
    trackDistanceMeters?: number
  ) => {
    const map = getMap()
    if (!map) return

    const pts = points || []
    if (pts.length < 2) {
      if (trackPolyline) {
        trackPolyline.remove()
        trackPolyline = null
      }
      if (trackBgPolyline) {
        trackBgPolyline.remove()
        trackBgPolyline = null
      }
      if (trackHitPolyline) {
        trackHitPolyline.remove()
        trackHitPolyline = null
      }
      return
    }

    const latlngs = pts.map(p => [p.lat, p.lng] as [number, number])

    if (!trackPolyline || !trackBgPolyline || !trackHitPolyline) {
      // Usynlig bred treffsone (24px) for enkel klikk/trykk på mobil og desktop
      trackHitPolyline = L.polyline(latlngs, {
        color: '#000000',
        weight: 24,
        opacity: 0,
        lineCap: 'round',
        lineJoin: 'round',
        className: 'track-interactive-line',
        interactive: true,
      }).addTo(map)

      trackBgPolyline = L.polyline(latlngs, {
        color: '#0f172a',
        weight: 6,
        opacity: 0.55,
        lineCap: 'round',
        lineJoin: 'round',
        className: 'track-interactive-line',
        interactive: true,
      }).addTo(map)

      trackPolyline = L.polyline(latlngs, {
        color: '#f97316',
        weight: 3.5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
        className: 'track-interactive-line',
        interactive: true,
      }).addTo(map)

      trackHitPolyline.on('click', onTrackClick)
      trackBgPolyline.on('click', onTrackClick)
      trackPolyline.on('click', onTrackClick)

      trackHitPolyline.bindTooltip(getTrackTooltipContent(trackName, trackDistanceMeters), {
        sticky: true,
        className: 'track-map-tooltip-wrap',
        direction: 'top',
      })
    } else {
      trackHitPolyline.setLatLngs(latlngs)
      trackBgPolyline.setLatLngs(latlngs)
      trackPolyline.setLatLngs(latlngs)
      trackHitPolyline.setTooltipContent(getTrackTooltipContent(trackName, trackDistanceMeters))
    }
  }

  const updateTooltip = (trackName?: string, trackDistanceMeters?: number) => {
    if (trackHitPolyline) {
      trackHitPolyline.setTooltipContent(getTrackTooltipContent(trackName, trackDistanceMeters))
    }
  }

  const zoomToTrack = (points?: TrackPoint[]) => {
    const map = getMap()
    if (!points || points.length < 2 || !map) return
    const latlngs = points.map(p => [p.lat, p.lng] as [number, number])
    const bounds = L.latLngBounds(latlngs)
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16, animate: true })
    }
  }

  const cleanup = () => {
    if (trackPolyline) {
      trackPolyline.remove()
      trackPolyline = null
    }
    if (trackBgPolyline) {
      trackBgPolyline.remove()
      trackBgPolyline = null
    }
    if (trackHitPolyline) {
      trackHitPolyline.remove()
      trackHitPolyline = null
    }
  }

  return {
    updateTrackLayer,
    updateTooltip,
    zoomToTrack,
    cleanup
  }
}
