import L from 'leaflet'
import type { AisVessel } from '@/composables/useAis'
import { createVesselIcon } from '@/utils/mapIcons'

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

export function useMapAisLayer(getMap: () => L.Map | null) {
  let vesselsLayerGroup: L.LayerGroup | null = null

  const initLayer = () => {
    const map = getMap()
    if (!map) return
    if (!vesselsLayerGroup) {
      vesselsLayerGroup = L.layerGroup().addTo(map)
    }
  }

  const updateVesselMarkers = (
    ships: AisVessel[] | undefined,
    isAisToggled: boolean | undefined,
    isZoomSufficient: boolean | undefined
  ) => {
    const map = getMap()
    if (!map) return
    if (!vesselsLayerGroup) {
      initLayer()
    }
    if (!vesselsLayerGroup) return

    vesselsLayerGroup.clearLayers()
    if (!isAisToggled || !isZoomSufficient || !ships || ships.length === 0) {
      return
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

  const cleanup = () => {
    if (vesselsLayerGroup) {
      vesselsLayerGroup.clearLayers()
      vesselsLayerGroup.remove()
      vesselsLayerGroup = null
    }
  }

  return {
    initLayer,
    updateVesselMarkers,
    cleanup
  }
}
