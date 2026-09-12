import L from 'leaflet'

export interface MunicipalityCallbacks {
  getKommuneInfo?: (name: string) => { fylkeName: string; count: number } | null
  getSelectedKommuneName: () => string | null
  onClearTurposter: () => void
  onSelectKommuneByName: (name: string) => void
  onDisableMunicipalities: () => void
}

let cachedGeoJsonData: any = null

export function useMapMunicipalitiesLayer(
  getMap: () => L.Map | null,
  callbacks: MunicipalityCallbacks
) {
  let geoJsonLayer: L.GeoJSON | null = null

  const getKommuneStyle = (feature: any) => {
    const name = feature?.properties?.kommunenavn || feature?.properties?.name || ''
    const selectedName = callbacks.getSelectedKommuneName()
    const isSelected = selectedName && name.toLowerCase() === selectedName.toLowerCase()

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
    const map = getMap()
    if (!map) return

    const info = callbacks.getKommuneInfo ? callbacks.getKommuneInfo(name) : null
    const selectedName = callbacks.getSelectedKommuneName()
    const isCurrentlySelected = selectedName && selectedName.toLowerCase() === name.toLowerCase()

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
        <div style="margin-top: 10px; display: flex; flex-direction: column; gap: 6px;">
          ${isCurrentlySelected 
            ? `<button id="btn-popup-toggle" class="btn-popup-toggle btn-popup-hide">✕ Skjul turposter</button>`
            : `<button id="btn-popup-toggle" class="btn-popup-toggle btn-popup-show">⛰️ Vis turposter for ${name}</button>`
          }
          <button id="btn-popup-disable-borders" class="btn-popup-toggle btn-popup-borders">🗺️ Deaktiver kommunegrenser</button>
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
          callbacks.onClearTurposter()
        } else {
          callbacks.onSelectKommuneByName(name)
        }
        map?.closePopup(popup)
      })
    }

    const btnBorders = popupDiv.querySelector('#btn-popup-disable-borders')
    if (btnBorders) {
      btnBorders.addEventListener('click', () => {
        callbacks.onDisableMunicipalities()
        map?.closePopup(popup)
      })
    }
  }

  const renderMunicipalitiesLayer = (showMunicipalities: boolean) => {
    const map = getMap()
    if (!map || !cachedGeoJsonData) return

    if (geoJsonLayer) {
      map.removeLayer(geoJsonLayer)
      geoJsonLayer = null
    }

    if (!showMunicipalities) return

    geoJsonLayer = L.geoJSON(cachedGeoJsonData, {
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

  const loadMunicipalitiesGeoJson = async (showMunicipalities: boolean) => {
    if (cachedGeoJsonData) {
      renderMunicipalitiesLayer(showMunicipalities)
      return
    }
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}data/kommuner.geojson`)
      if (!res.ok) return
      cachedGeoJsonData = await res.json()
      renderMunicipalitiesLayer(showMunicipalities)
    } catch (err) {
      console.warn('Kunne ikke laste kommunegrenser:', err)
    }
  }

  const cleanup = () => {
    const map = getMap()
    if (geoJsonLayer && map) {
      map.removeLayer(geoJsonLayer)
      geoJsonLayer = null
    }
  }

  return {
    loadMunicipalitiesGeoJson,
    renderMunicipalitiesLayer,
    openKommunePopup,
    cleanup
  }
}
