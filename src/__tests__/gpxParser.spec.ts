import { describe, it, expect } from 'vitest'
import { parseGpx } from '../utils/gpxParser'
import { readFileSync } from 'fs'
import { resolve } from 'path'

describe('gpxParser', () => {
  it('parser en ekte Sports Tracker GPX-fil (tracks/2026-09-04.gpx)', () => {
    const filePath = resolve(__dirname, '../../tracks/2026-09-04.gpx')
    const gpxContent = readFileSync(filePath, 'utf-8')

    const result = parseGpx(gpxContent)
    expect(result.name).toBe('Rollandsoksen')
    expect(result.points.length).toBeGreaterThan(100)

    const first = result.points[0]
    expect(first).toBeDefined()
    expect(first!.lat).toBeCloseTo(60.462017, 5)
    expect(first!.lng).toBeCloseTo(5.343802, 5)
    expect(first!.timestamp).toBe(Date.parse('2026-09-04T09:27:45Z'))
  })

  it('parser standard GPX 1.1 med <trk><name>', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <gpx version="1.1" creator="test">
      <trk>
        <name>Ulriken opp</name>
        <trkseg>
          <trkpt lat="60.37" lon="5.38">
            <time>2026-09-10T12:00:00Z</time>
          </trkpt>
          <trkpt lat="60.38" lon="5.39">
            <time>2026-09-10T12:10:00Z</time>
          </trkpt>
        </trkseg>
      </trk>
    </gpx>`

    const result = parseGpx(xml)
    expect(result.name).toBe('Ulriken opp')
    expect(result.points.length).toBe(2)
    expect(result.points[0]!.lat).toBe(60.37)
    expect(result.points[0]!.lng).toBe(5.38)
    expect(result.points[0]!.timestamp).toBe(Date.parse('2026-09-10T12:00:00Z'))
  })

  it('kaster feil ved ugyldig eller tom XML', () => {
    expect(() => parseGpx('')).toThrow('GPX-innholdet er tomt')
    expect(() => parseGpx('<gpx><trk></trk></gpx>')).toThrow('Ingen gyldige GPS-punkter funnet')
  })
})
