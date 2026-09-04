import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import https from 'node:https'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const csvPath = path.join(rootDir, 'data', 'mountains.csv')
const outDir = path.join(rootDir, 'public', 'data')
const turposterDir = path.join(outDir, 'turposter')
const geojsonPath = path.join(outDir, 'kommuner.geojson')

export function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function ensureGeoJson() {
  return new Promise((resolve) => {
    if (fs.existsSync(geojsonPath)) {
      console.log('kommuner.geojson already exists.')
      return resolve()
    }
    console.log('Downloading kommuner.geojson...')
    const file = fs.createWriteStream(geojsonPath)
    https.get('https://raw.githubusercontent.com/robhop/fylker-og-kommuner/main/Kommuner-S.geojson', (res) => {
      res.pipe(file)
      file.on('finish', () => {
        file.close()
        console.log('Downloaded kommuner.geojson successfully!')
        resolve()
      })
    }).on('error', (err) => {
      console.warn('Could not download kommuner.geojson:', err.message)
      resolve()
    })
  })
}

async function buildData() {
  console.log('Building JSON data from data/mountains.csv...')

  if (!fs.existsSync(csvPath)) {
    console.error('mountains.csv not found at:', csvPath)
    process.exit(1)
  }

  // Slett og gjenopprett turposterDir for å fjerne gamle URL-kodede mapper
  if (fs.existsSync(turposterDir)) {
    fs.rmSync(turposterDir, { recursive: true, force: true })
  }
  fs.mkdirSync(turposterDir, { recursive: true })

  await ensureGeoJson()

  const fileStream = fs.createReadStream(csvPath, { encoding: 'utf-8' })
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity })

  let headers = null
  const fylker = {}
  let totalCount = 0

  for await (const line of rl) {
    if (!line.trim()) continue
    if (!headers) {
      headers = line.split(';').map(h => h.trim())
      continue
    }

    const parts = line.split(';')
    if (parts.length < 7) continue

    const [id, name, latStr, lngStr, altStr, fylke, kommune] = parts
    const lat = parseFloat(latStr)
    const lng = parseFloat(lngStr)
    const alt = parseInt(altStr, 10)

    if (isNaN(lat) || isNaN(lng) || !fylke || !kommune) continue

    const cleanFylke = fylke.trim()
    const cleanKommune = kommune.trim()

    if (!fylker[cleanFylke]) {
      fylker[cleanFylke] = {}
    }
    if (!fylker[cleanFylke][cleanKommune]) {
      fylker[cleanFylke][cleanKommune] = []
    }

    fylker[cleanFylke][cleanKommune].push({
      id: id.trim(),
      name: name.trim(),
      lat,
      lng,
      alt: isNaN(alt) ? null : alt
    })
    totalCount++
  }

  // Lag struktur for hierarchy.json
  const hierarchy = []

  const sortedFylker = Object.keys(fylker).sort((a, b) => {
    if (a.toLowerCase() === 'utlandet') return 1
    if (b.toLowerCase() === 'utlandet') return -1
    return a.localeCompare(b, 'no')
  })

  for (const fylkeName of sortedFylker) {
    const fylkeSlug = slugify(fylkeName)
    const fylkeOutDir = path.join(turposterDir, fylkeSlug)
    fs.mkdirSync(fylkeOutDir, { recursive: true })

    const kommunerList = []
    let fylkeTotalCount = 0

    for (const kommuneName of Object.keys(fylker[fylkeName]).sort((a, b) => a.localeCompare(b, 'no'))) {
      const posts = fylker[fylkeName][kommuneName]
      const kommuneSlug = slugify(kommuneName)

      // Skriv kommune JSON-fil
      const kommuneFile = path.join(fylkeOutDir, `${kommuneSlug}.json`)
      fs.writeFileSync(kommuneFile, JSON.stringify(posts))

      kommunerList.push({
        name: kommuneName,
        slug: kommuneSlug,
        count: posts.length
      })
      fylkeTotalCount += posts.length
    }

    hierarchy.push({
      name: fylkeName,
      slug: fylkeSlug,
      count: fylkeTotalCount,
      kommuner: kommunerList
    })
  }

  // Skriv hierarchy.json
  const hierarchyFile = path.join(outDir, 'hierarchy.json')
  fs.writeFileSync(hierarchyFile, JSON.stringify(hierarchy, null, 2))

  console.log(`Successfully generated hierarchy.json and ${totalCount} turposter across ${hierarchy.length} fylker!`)
}

buildData().catch(err => {
  console.error('Error building data:', err)
  process.exit(1)
})
