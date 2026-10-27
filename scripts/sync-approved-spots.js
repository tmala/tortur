#!/usr/bin/env node

/**
 * scripts/sync-approved-spots.js
 *
 * Henter godkjente turposter (approved_spots) fra Firebase Realtime Database,
 * fletter dem alfabetisk inn i data/mountains.csv, og markerer dem som "exported" i Firebase.
 *
 * Bruk:
 *   node scripts/sync-approved-spots.js [--dry-run] [--token=<firebase_auth_or_secret>]
 *   npm run sync:spots
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const csvPath = path.join(rootDir, 'data', 'mountains.csv')
const envPath = path.join(rootDir, '.env')

// Les inn .env manuelt hvis tilstede
function loadEnv() {
  const env = {}
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim()
        const val = trimmed.slice(idx + 1).trim()
        env[key] = val
      }
    }
  }
  return env
}

const env = loadEnv()
const dbUrl = (process.env.VITE_FIREBASE_DB_URL || env.VITE_FIREBASE_DB_URL || '').replace(/\/$/, '')
const dbPrefix = (process.env.FIREBASE_PREFIX || env.FIREBASE_PREFIX || 'tortur').replace(/^\/|\/$/g, '')
const authToken = process.env.FIREBASE_AUTH_TOKEN || env.FIREBASE_AUTH_TOKEN || null

const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const shouldDeleteExported = args.includes('--delete-exported')

console.log('🏔️  TorTur: Synkroniserer godkjente forslag til mountains.csv')
if (isDryRun) {
  console.log('🔍 [DRY RUN AKTIV] Ingen endringer vil bli skrevet til fil eller database.')
}

async function run() {
  if (!dbUrl) {
    console.error('❌ VITE_FIREBASE_DB_URL mangler i .env eller miljøvariabler.')
    process.exit(1)
  }

  if (!fs.existsSync(csvPath)) {
    console.error(`❌ Fant ikke mountains.csv på sti: ${csvPath}`)
    process.exit(1)
  }

  const tokenParam = authToken ? `?auth=${encodeURIComponent(authToken)}` : ''
  const url = `${dbUrl}/${dbPrefix}/approved_spots.json${tokenParam}`

  console.log(`📡 Henter godkjente turposter fra Firebase: ${dbUrl}/${dbPrefix}/approved_spots.json ...`)

  let data
  try {
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    }
    data = await res.json()
  } catch (err) {
    console.error('❌ Kunne ikke hente approved_spots fra Firebase:', err.message)
    console.error('💡 Tips: Sjekk nettverkstilkobling og eventuelt FIREBASE_AUTH_TOKEN i .env dersom reglene krever autentisering.')
    process.exit(1)
  }

  if (!data || typeof data !== 'object') {
    console.log('✅ Ingen godkjente turposter funnet i Firebase Realtime Database.')
    return
  }

  const allApproved = Object.entries(data).map(([id, val]) => {
    const item = val || {}
    return {
      id: String(item.id || id),
      name: String(item.name || ''),
      lat: Number(item.lat),
      lng: Number(item.lng),
      alt: item.alt !== undefined && item.alt !== null ? Number(item.alt) : null,
      fylke: String(item.fylke || ''),
      kommune: String(item.kommune || ''),
      csvLine: typeof item.csvLine === 'string' ? item.csvLine : '',
      status: String(item.status || 'approved'),
      exportedToCsv: Boolean(item.exportedToCsv)
    }
  })

  // Filtrer ut de som allerede er eksportert
  const alreadyExported = allApproved.filter(s => s.exportedToCsv || s.status === 'exported')
  const pendingExport = allApproved.filter(s => !s.exportedToCsv && s.status !== 'exported')

  // Hvis --delete-exported er angitt, slett poster som allerede er merket som eksportert i Firebase
  if (shouldDeleteExported && alreadyExported.length > 0) {
    console.log(`🗑️  Sletter ${alreadyExported.length} tidligere eksporterte turposter fra Firebase approved_spots...`)
    for (const spot of alreadyExported) {
      const spotUrl = `${dbUrl}/${dbPrefix}/approved_spots/${encodeURIComponent(spot.id)}.json${tokenParam}`
      try {
        if (!isDryRun) {
          const delRes = await fetch(spotUrl, { method: 'DELETE' })
          if (!delRes.ok) throw new Error(`HTTP ${delRes.status}`)
        }
        console.log(`   - Slettet: ${spot.name} (${spot.id})`)
      } catch (err) {
        console.warn(`   ⚠️ Kunne ikke slette ${spot.id}:`, err.message)
      }
    }
  }

  if (pendingExport.length === 0) {
    console.log(`✅ Ingen nye ueksporterte turposter å flette inn i mountains.csv.`)
    return
  }

  console.log(`📋 Fant ${pendingExport.length} nye godkjente turposter klare for eksport (av totalt ${allApproved.length}).`)

  // Les inn mountains.csv
  const csvContent = fs.readFileSync(csvPath, 'utf-8')
  const lines = csvContent.split(/\r?\n/).filter(l => l.trim().length > 0)
  const header = lines[0] || 'TurpostId;TurpostNavn;Breddegrad;Lengdegrad;Hoydemeter;Fylke;Kommune'

  // Finn eksisterende ID-er i CSV for å unngå duplikater
  const existingIds = new Set()
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(';')
    if (parts.length > 0 && parts[0]) {
      existingIds.add(parts[0].trim())
    }
  }

  const FYLKE_NUMMER_MAP = {
    '03': 'Oslo',
    '11': 'Rogaland',
    '15': 'Møre og Romsdal',
    '18': 'Nordland',
    '31': 'Østfold',
    '32': 'Akershus',
    '33': 'Buskerud',
    '34': 'Innlandet',
    '39': 'Vestfold',
    '40': 'Telemark',
    '42': 'Agder',
    '46': 'Vestland',
    '50': 'Trøndelag',
    '55': 'Troms',
    '56': 'Finnmark'
  }

  const geojsonPath = path.join(rootDir, 'public', 'data', 'kommuner.geojson')
  const kommuneToFylkeGeoJson = {}
  try {
    if (fs.existsSync(geojsonPath)) {
      const geoRaw = JSON.parse(fs.readFileSync(geojsonPath, 'utf-8'))
      for (const feat of geoRaw.features || []) {
        const kName = feat.properties?.name || feat.properties?.kommunenavn
        const knr = feat.properties?.kommunenummer || feat.properties?.id
        if (kName && knr && String(knr).length >= 2) {
          const fName = FYLKE_NUMMER_MAP[String(knr).slice(0, 2)]
          if (fName) {
            kommuneToFylkeGeoJson[kName.toLowerCase().trim()] = fName
          }
        }
      }
    }
  } catch (err) {
    console.warn('Kunne ikke bygge kommune-til-fylke-oppslag fra geojson:', err.message)
  }

  const addedSpots = []
  const skippedSpots = []

  // Behandle hver post
  for (const spot of pendingExport) {
    if (existingIds.has(spot.id)) {
      skippedSpots.push(spot)
      continue
    }

    let resolvedFylke = (spot.fylke || '').trim()
    if (!resolvedFylke && spot.kommune) {
      resolvedFylke = kommuneToFylkeGeoJson[spot.kommune.toLowerCase().trim()] || ''
    }

    let cleanLine = spot.csvLine && spot.csvLine.includes(';')
      ? spot.csvLine.trim()
      : `${spot.id};${spot.name};${spot.lat.toFixed(6)};${spot.lng.toFixed(6)};${spot.alt !== null ? Math.round(spot.alt) : 0};${resolvedFylke};${spot.kommune}`

    // Hvis csvLine manglet fylke (f.eks. ...;alt;;Kommune), fyll inn resolvedFylke
    const lineParts = cleanLine.split(';')
    if (lineParts.length >= 7 && !lineParts[5].trim() && resolvedFylke) {
      lineParts[5] = resolvedFylke
      cleanLine = lineParts.join(';')
    }

    // Finn riktig alfabetisk posisjon (sammenlign TurpostNavn, indeks 1)
    const cleanNewName = spot.name.trim()
    let insertIndex = lines.length // default bakerst

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(';')
      if (parts.length < 2) continue
      const existingName = (parts[1] || '').trim()

      if (existingName.localeCompare(cleanNewName, 'nb', { sensitivity: 'base' }) > 0) {
        insertIndex = i
        break
      }
    }

    lines.splice(insertIndex, 0, cleanLine)
    existingIds.add(spot.id)
    addedSpots.push({ spot, line: cleanLine, lineNumber: insertIndex + 1 })
  }

  if (skippedSpots.length > 0) {
    console.log(`ℹ️  Hoppet over ${skippedSpots.length} poster som allerede fantes i mountains.csv:`)
    skippedSpots.forEach(s => console.log(`   - ${s.name} (${s.id})`))
  }

  if (addedSpots.length === 0) {
    console.log('✅ Ingen nye linjer trengte å legges inn i mountains.csv.')
    return
  }

  console.log(`\n✨ Legger til ${addedSpots.length} nye turposter i mountains.csv:`)
  for (const item of addedSpots) {
    console.log(`   Linje ${item.lineNumber}: ${item.spot.name} (${item.spot.kommune}, ${item.spot.fylke})`)
    console.log(`   CSV: ${item.line}`)
  }

  if (isDryRun) {
    console.log('\n🔍 [DRY RUN FULLFØRT] Ingen endringer ble skrevet.')
    return
  }

  // 1. Skriv til mountains.csv
  const newCsvContent = lines.join('\n') + '\n'
  fs.writeFileSync(csvPath, newCsvContent, 'utf-8')
  console.log(`\n💾 Oppdaterte ${csvPath} (totalt ${lines.length} linjer inkludert overskrift).`)

  // 2. Oppdater status i Firebase approved_spots
  const nowIso = new Date().toISOString()
  console.log('📡 Oppdaterer status i Firebase Realtime Database...')

  for (const item of addedSpots) {
    const spotId = item.spot.id
    const spotUrl = `${dbUrl}/${dbPrefix}/approved_spots/${encodeURIComponent(spotId)}.json${tokenParam}`

    try {
      if (shouldDeleteExported) {
        await fetch(spotUrl, { method: 'DELETE' })
      } else {
        await fetch(spotUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'exported',
            exportedToCsv: true,
            exportedAt: nowIso
          })
        })
      }
    } catch (patchErr) {
      console.warn(`⚠️  Kunne ikke oppdatere status i Firebase for spot ${spotId}:`, patchErr.message)
    }
  }

  // Hvis det var poster som allerede fantes i CSV, merk dem som eksportert (eller slett hvis flagget er satt)
  for (const s of skippedSpots) {
    const spotUrl = `${dbUrl}/${dbPrefix}/approved_spots/${encodeURIComponent(s.id)}.json${tokenParam}`
    try {
      if (shouldDeleteExported) {
        await fetch(spotUrl, { method: 'DELETE' })
      } else {
        await fetch(spotUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'exported',
            exportedToCsv: true,
            exportedAt: nowIso
          })
        })
      }
    } catch {}
  }

  console.log('✅ Ferdig! Alle nye turposter er nå flettet inn og merket som eksportert.')
  console.log('💡 Husk å kjøre `npm run build` før du distribuerer oppdateringen til webhotellet!')
}

run().catch(err => {
  console.error('❌ Uventet feil:', err)
  process.exit(1)
})
