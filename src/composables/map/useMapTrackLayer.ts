import { ref } from 'vue'
import L from 'leaflet'
import { type TrackPoint, formatDistance } from '@/composables/useGeolocation'
import { calculateKmMarkers } from '@/utils/trackKmMarkers'
import { createKmMarkerIcon, createTrackReplayIcon } from '@/utils/mapIcons'
import {
  getTrackDurationMs,
  interpolatePositionAtElapsedMs
} from '@/utils/trackPlayback'
import type { TrackPhoto } from '@/composables/useTrackPhotos'
import { clusterTrackPhotos, type TrackPhotoCluster } from '@/utils/trackPhotoCluster'

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

function formatPhotoTime(timestamp?: number): string {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleTimeString('no-NO', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

function createPhotoMarkerIcon(photo: TrackPhoto, count: number = 1): L.DivIcon {
  const src = photo.thumbnailUrl || photo.thumbnailDataUrl || photo.url
  const isCluster = count > 1
  const badgeHtml = isCluster
    ? `<span class="track-photo-pin-badge cluster-count">${count}</span>`
    : `<span class="track-photo-pin-badge">📷</span>`
  const clusterClass = isCluster ? ' is-cluster' : ''
  const titleText = isCluster
    ? `${count} turbilder her (klikk for å velge)`
    : photo.filename

  const html = `
    <div class="track-photo-map-pin${clusterClass}" title="${escapeTrackHtml(titleText)}">
      <img src="${escapeTrackHtml(src)}" alt="${escapeTrackHtml(photo.filename)}" class="track-photo-pin-img" loading="lazy" />
      ${badgeHtml}
    </div>
  `
  return L.divIcon({
    className: 'track-photo-pin-container',
    html,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18]
  })
}

function createClusterPopupHtml(cluster: TrackPhotoCluster): string {
  const count = cluster.photos.length
  const times = cluster.photos
    .map((p) => p.exifTimestamp || p.uploadedAt)
    .filter((t): t is number => typeof t === 'number' && t > 0)

  let subtitle = ''
  if (times.length > 0) {
    const minTime = formatPhotoTime(Math.min(...times))
    const maxTime = formatPhotoTime(Math.max(...times))
    subtitle = minTime === maxTime ? `kl. ${minTime}` : `kl. ${minTime} – ${maxTime}`
  }

  let itemsHtml = ''
  for (let i = 0; i < cluster.photos.length; i++) {
    const p = cluster.photos[i]
    if (!p) continue
    const pSrc = p.thumbnailUrl || p.thumbnailDataUrl || p.url
    const pTime = formatPhotoTime(p.exifTimestamp || p.uploadedAt)
    const pId = p.id || p.fileId
    itemsHtml += `
      <button type="button" class="cluster-thumb-item" data-photo-index="${i}" data-photo-id="${escapeTrackHtml(pId)}" title="${escapeTrackHtml(p.filename)}" aria-label="${escapeTrackHtml(p.filename)}">
        <img src="${escapeTrackHtml(pSrc)}" alt="${escapeTrackHtml(p.filename)}" class="cluster-thumb-img" loading="lazy" />
        ${pTime ? `<span class="cluster-thumb-time">${escapeTrackHtml(pTime)}</span>` : ''}
      </button>
    `
  }

  return `
    <div class="track-photo-cluster-popup">
      <div class="cluster-popup-header">
        <strong class="cluster-popup-title">📷 ${count} bilder tatt her</strong>
        ${subtitle ? `<span class="cluster-popup-subtitle">${escapeTrackHtml(subtitle)}</span>` : ''}
      </div>
      <div class="cluster-thumbs-grid">
        ${itemsHtml}
      </div>
    </div>
  `
}

export function useMapTrackLayer(
  getMap: () => L.Map | null,
  onClickTrack: () => void,
  onClickPhoto?: (photo: TrackPhoto, clusterPhotos?: TrackPhoto[]) => void
) {
  let trackPolyline: L.Polyline | null = null
  let trackBgPolyline: L.Polyline | null = null
  let trackHitPolyline: L.Polyline | null = null
  let kmMarkersLayer: L.LayerGroup | null = null
  let trackPhotosLayer: L.LayerGroup | null = null

  // Tilstand for animert avspilling av sporet
  const isReplaying = ref(false)
  const replayProgress = ref(0)
  const replaySpeed = ref(40)

  const setReplaySpeed = (speed: number) => {
    if (speed > 0) {
      replaySpeed.value = speed
    }
  }

  let currentPoints: TrackPoint[] = []
  let replayMarker: L.Marker | null = null
  let replayElapsedMs = 0
  let replayAnimFrameId: number | null = null
  let lastAnimWallTime: number | null = null

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
    trackDistanceMeters?: number,
    showKmMarkers: boolean = true,
    trackPhotos: TrackPhoto[] = []
  ) => {
    const map = getMap()
    if (!map) return

    const pts = points || []
    const pointsChanged = pts !== currentPoints
    currentPoints = pts

    if (pointsChanged) {
      stopReplay()
    }

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
      if (kmMarkersLayer) {
        kmMarkersLayer.clearLayers()
        kmMarkersLayer.remove()
        kmMarkersLayer = null
      }
      if (trackPhotosLayer) {
        trackPhotosLayer.clearLayers()
        trackPhotosLayer.remove()
        trackPhotosLayer = null
      }
      map.closePopup()
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

    // Oppdater kilometermarkører langs sporet
    if (!showKmMarkers) {
      if (kmMarkersLayer) {
        kmMarkersLayer.clearLayers()
      }
    } else {
      const kmMarkers = calculateKmMarkers(pts)

      if (!kmMarkersLayer) {
        kmMarkersLayer = L.layerGroup().addTo(map)
      } else {
        kmMarkersLayer.clearLayers()
        if (!map.hasLayer(kmMarkersLayer)) {
          kmMarkersLayer.addTo(map)
        }
      }

      for (const markerInfo of kmMarkers) {
        const icon = createKmMarkerIcon(markerInfo)
        const marker = L.marker([markerInfo.lat, markerInfo.lng], {
          icon,
          interactive: true,
          zIndexOffset: 500,
        })

        let tooltipHtml = `<div class="track-km-tooltip"><strong class="km-tt-title">${markerInfo.km}. kilometer</strong>`
        if (markerInfo.splitDetailed) {
          tooltipHtml += `<div class="km-tt-row"><span class="km-tt-label">Splittid:</span> <span class="km-tt-val">${escapeTrackHtml(markerInfo.splitDetailed)}</span></div>`
        }
        if (markerInfo.cumulativeDetailed) {
          tooltipHtml += `<div class="km-tt-row"><span class="km-tt-label">Fra start:</span> <span class="km-tt-val">${escapeTrackHtml(markerInfo.cumulativeDetailed)}</span></div>`
        }
        tooltipHtml += `</div>`

        marker.bindTooltip(tooltipHtml, {
          direction: 'top',
          offset: [0, -6],
          className: 'track-km-tooltip-wrap',
        })

        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e)
          onClickTrack()
        })

        marker.addTo(kmMarkersLayer)
      }
    }

    // Oppdater turbilder på kartet
    if (!trackPhotosLayer) {
      trackPhotosLayer = L.layerGroup().addTo(map)
    } else {
      trackPhotosLayer.clearLayers()
      if (!map.hasLayer(trackPhotosLayer)) {
        trackPhotosLayer.addTo(map)
      }
    }

    const clusters = clusterTrackPhotos(trackPhotos)

    for (const cluster of clusters) {
      const firstPhoto = cluster.photos[0]
      if (!firstPhoto) continue
      const count = cluster.photos.length
      const icon = createPhotoMarkerIcon(firstPhoto, count)
      const marker = L.marker([cluster.lat, cluster.lng], {
        icon,
        interactive: true,
        zIndexOffset: 650,
      })

      if (count === 1) {
        marker.bindTooltip(escapeTrackHtml(firstPhoto.filename), {
          direction: 'top',
          offset: [0, -18],
          className: 'track-km-tooltip-wrap',
        })

        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e)
          if (onClickPhoto) {
            onClickPhoto(firstPhoto, cluster.photos)
          }
        })
      } else {
        marker.bindTooltip(`${count} turbilder her (klikk for å velge)`, {
          direction: 'top',
          offset: [0, -18],
          className: 'track-km-tooltip-wrap',
        })

        const popupHtml = createClusterPopupHtml(cluster)
        const popup = L.popup({
          className: 'track-photo-cluster-popup-wrap',
          maxWidth: 340,
          minWidth: 220,
          autoPan: true,
          autoPanPadding: [20, 20],
          closeButton: true,
        }).setContent(popupHtml)

        marker.bindPopup(popup)

        marker.on('popupopen', (e) => {
          const popupEl = (e as L.PopupEvent).popup.getElement()
          if (!popupEl) return

          const handleSelect = (btn: HTMLElement) => {
            const idxStr = btn.getAttribute('data-photo-index')
            const idx = idxStr !== null ? parseInt(idxStr, 10) : -1
            const photoId = btn.getAttribute('data-photo-id')
            const selected =
              (idx >= 0 ? cluster.photos[idx] : undefined) ||
              cluster.photos.find((p) => (p.id || p.fileId) === photoId)

            if (selected && onClickPhoto) {
              marker.closePopup()
              onClickPhoto(selected, cluster.photos)
            }
          }

          // Robust delegert klikk-håndtering på popup-beholderen
          popupEl.onclick = (ev) => {
            const target = ev.target as HTMLElement | null
            const btn = target?.closest<HTMLElement>('.cluster-thumb-item')
            if (btn) {
              ev.stopPropagation()
              handleSelect(btn)
            }
          }

          const buttons = popupEl.querySelectorAll<HTMLButtonElement>('.cluster-thumb-item')
          buttons.forEach((btn) => {
            btn.onclick = (ev) => {
              ev.stopPropagation()
              handleSelect(btn)
            }
          })
        })
      }

      marker.addTo(trackPhotosLayer)
    }
  }

  const updateTooltip = (trackName?: string, trackDistanceMeters?: number) => {
    if (trackHitPolyline) {
      trackHitPolyline.setTooltipContent(getTrackTooltipContent(trackName, trackDistanceMeters))
    }
  }

  const updateReplayMarkerPosition = (elapsedMs: number) => {
    if (!replayMarker || currentPoints.length < 2) return
    const pos = interpolatePositionAtElapsedMs(currentPoints, elapsedMs)
    if (!pos) return

    replayMarker.setLatLng([pos.lat, pos.lng])
    replayProgress.value = pos.progress

    const iconEl = replayMarker.getElement()
    const avatarEl = iconEl?.querySelector<HTMLElement>('.track-replay-avatar')
    if (avatarEl) {
      avatarEl.style.transform = `rotate(${Math.round(pos.bearing)}deg)`
    }
  }

  const onReplayAnimFrame = (wallNow: number) => {
    if (!isReplaying.value) return

    if (lastAnimWallTime === null) {
      lastAnimWallTime = wallNow
    }

    const dtWall = wallNow - lastAnimWallTime
    lastAnimWallTime = wallNow

    // Begrens dt til maks 100ms for å unngå hopp dersom fanen har vært i bakgrunnen
    const clampedDt = Math.min(100, dtWall)
    const totalDuration = getTrackDurationMs(currentPoints)

    replayElapsedMs += clampedDt * replaySpeed.value

    if (replayElapsedMs >= totalDuration) {
      replayElapsedMs = totalDuration
      updateReplayMarkerPosition(replayElapsedMs)
      isReplaying.value = false
      lastAnimWallTime = null
      replayAnimFrameId = null
      return
    }

    updateReplayMarkerPosition(replayElapsedMs)
    replayAnimFrameId = requestAnimationFrame(onReplayAnimFrame)
  }

  const startReplay = (speedMultiplier?: number) => {
    const map = getMap()
    if (!map || currentPoints.length < 2) return

    if (speedMultiplier && speedMultiplier > 0) {
      replaySpeed.value = speedMultiplier
    }

    const totalDuration = getTrackDurationMs(currentPoints)
    // Hvis vi er ved slutten, start forfra
    if (replayElapsedMs >= totalDuration) {
      replayElapsedMs = 0
      replayProgress.value = 0
    }

    if (!replayMarker) {
      const initialPos = interpolatePositionAtElapsedMs(currentPoints, replayElapsedMs)
      if (!initialPos) return
      replayMarker = L.marker([initialPos.lat, initialPos.lng], {
        icon: createTrackReplayIcon(initialPos.bearing),
        interactive: false,
        zIndexOffset: 2000
      }).addTo(map)
    }

    isReplaying.value = true
    lastAnimWallTime = null
    if (replayAnimFrameId) {
      cancelAnimationFrame(replayAnimFrameId)
    }
    replayAnimFrameId = requestAnimationFrame(onReplayAnimFrame)
  }

  const pauseReplay = () => {
    isReplaying.value = false
    lastAnimWallTime = null
    if (replayAnimFrameId) {
      cancelAnimationFrame(replayAnimFrameId)
      replayAnimFrameId = null
    }
  }

  const stopReplay = () => {
    pauseReplay()
    replayElapsedMs = 0
    replayProgress.value = 0
    if (replayMarker) {
      replayMarker.remove()
      replayMarker = null
    }
  }

  const toggleReplay = (speedMultiplier?: number) => {
    if (isReplaying.value) {
      pauseReplay()
    } else {
      startReplay(speedMultiplier)
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
    stopReplay()
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
    if (kmMarkersLayer) {
      kmMarkersLayer.clearLayers()
      kmMarkersLayer.remove()
      kmMarkersLayer = null
    }
    if (trackPhotosLayer) {
      trackPhotosLayer.clearLayers()
      trackPhotosLayer.remove()
      trackPhotosLayer = null
    }
  }

  return {
    updateTrackLayer,
    updateTooltip,
    zoomToTrack,
    cleanup,
    isReplaying,
    replayProgress,
    replaySpeed,
    setReplaySpeed,
    startReplay,
    pauseReplay,
    stopReplay,
    toggleReplay
  }
}
