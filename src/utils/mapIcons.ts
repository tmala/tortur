import L from 'leaflet'
import type { AisVessel } from '@/composables/useAis'

export const createUserIcon = (heading: number | null, isLive: boolean = false) => {
  const showHeading = isLive && heading !== null && heading !== undefined && !isNaN(heading)
  const headingStyle = showHeading
    ? `transform: rotate(${heading}deg); display: block;`
    : 'display: none;'

  return L.divIcon({
    className: 'custom-user-pin',
    html: `
      <div class="user-location-marker ${isLive ? 'is-live' : ''}">
        <div class="pulse-ring"></div>
        <div class="heading-indicator" style="${headingStyle}">
          <svg class="heading-indicator-svg" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
            <defs>
              <radialGradient id="user-compass-beam-grad" cx="24" cy="24" r="24" gradientUnits="userSpaceOnUse">
                <stop offset="25%" stop-color="#0284c7" stop-opacity="0.38" />
                <stop offset="65%" stop-color="#38bdf8" stop-opacity="0.18" />
                <stop offset="100%" stop-color="#38bdf8" stop-opacity="0" />
              </radialGradient>
            </defs>
            <!-- Google Maps-inspirert synsfelt / lyskjegle -->
            <path
              d="M 24 24 L 12 3 A 24 24 0 0 1 36 3 Z"
              fill="url(#user-compass-beam-grad)"
            />
            <!-- Tydelig fasettert kompassnål som peker i mobilens retning -->
            <g class="compass-pointer">
              <!-- Venstre side (lysere himmelblå) -->
              <path
                d="M 24 4 L 19 16 L 24 14.5 Z"
                fill="#38bdf8"
                stroke="#ffffff"
                stroke-width="1.2"
                stroke-linejoin="round"
              />
              <!-- Høyre side (dypere blå for 3D-effekt) -->
              <path
                d="M 24 4 L 29 16 L 24 14.5 Z"
                fill="#0284c7"
                stroke="#ffffff"
                stroke-width="1.2"
                stroke-linejoin="round"
              />
            </g>
          </svg>
        </div>
        <div class="marker-core"></div>
      </div>
    `,
    iconSize: [48, 48],
    iconAnchor: [24, 24]
  })
}

export const createTurpostIcon = (isVisited: boolean = false) => {
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

export const createPrivateTurpostIcon = (isVisited: boolean = false) => {
  return L.divIcon({
    className: 'custom-turpost-pin',
    html: `
      <div class="turpost-pin-marker is-private ${isVisited ? 'is-visited' : 'is-unvisited'}">
        <div class="turpost-pin-icon">
          <span>${isVisited ? '★' : '⭐'}</span>
        </div>
      </div>
    `,
    iconSize: [32, 38],
    iconAnchor: [16, 36],
    popupAnchor: [0, -32]
  })
}

export const createSuggestionTurpostIcon = () => {
  return L.divIcon({
    className: 'custom-turpost-pin suggestion-pin',
    html: `
      <div class="turpost-pin-marker is-suggestion">
        <div class="suggestion-pulse"></div>
        <div class="turpost-pin-icon">
          <span>📋</span>
        </div>
      </div>
    `,
    iconSize: [36, 42],
    iconAnchor: [18, 40],
    popupAnchor: [0, -36]
  })
}

export const createVesselIcon = (vessel: AisVessel) => {
  let color = '#38bdf8' // Blå passasjer / ferge
  if (vessel.shipCategory === 'cargo') color = '#22c55e' // Grønn last
  else if (vessel.shipCategory === 'tanker') color = '#eab308' // Gul/gull tankskip
  else if (vessel.shipCategory === 'tug') color = '#f97316' // Oransje slepebåt
  else if (vessel.shipCategory === 'rescue') color = '#ef4444' // Rød redning/kystvakt
  else if (vessel.shipCategory === 'fishing') color = '#a855f7' // Lilla fiskefartøy
  else if (vessel.shipCategory === 'military') color = '#4d7c0f' // Olivengrønn militær
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

export const createKmMarkerIcon = (marker: { km: number; splitFormatted?: string }) => {
  const hasSplit = Boolean(marker.splitFormatted)

  return L.divIcon({
    className: 'custom-km-marker-pin',
    html: `
      <div class="track-km-pin">
        <div class="track-km-pill">
          <span class="track-km-label">${marker.km} km</span>
          ${hasSplit ? `<span class="track-km-sep">•</span><span class="track-km-time">${marker.splitFormatted}</span>` : ''}
        </div>
        <div class="track-km-needle"></div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0]
  })
}

export const createTrackReplayIcon = (heading: number = 0) => {
  return L.divIcon({
    className: 'custom-track-replay-pin',
    html: `
      <div class="track-replay-avatar" style="transform: rotate(${Math.round(heading)}deg);">
        <div class="track-replay-pulse"></div>
        <div class="track-replay-arrow">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <polygon points="12,2 21,21 12,17 3,21" fill="#0284c7" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  })
}


