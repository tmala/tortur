import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const svgPath = path.join(rootDir, 'public', 'icon.svg')
const icoPath = path.join(rootDir, 'public', 'favicon.ico')
const appleTouchPath = path.join(rootDir, 'public', 'apple-touch-icon.png')

export async function generateFavicons() {
  if (!fs.existsSync(svgPath)) {
    console.warn('icon.svg not found, skipping favicon generation.')
    return
  }

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } })

  const svgContent = fs.readFileSync(svgPath, 'utf-8')
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <body style="margin: 0; padding: 0; background: transparent; overflow: hidden; display: flex; align-items: center; justify-content: center; width: 100vw; height: 100vh;">
        ${svgContent}
      </body>
    </html>
  `)

  const sizes = [16, 32, 48, 64]
  const pngBuffers = []

  for (const size of sizes) {
    await page.setViewportSize({ width: size, height: size })
    const buf = await page.screenshot({ type: 'png', omitBackground: true })
    pngBuffers.push({ size, buffer: buf })
  }

  await page.setViewportSize({ width: 180, height: 180 })
  const appleTouchBuf = await page.screenshot({ type: 'png', omitBackground: false })
  fs.writeFileSync(appleTouchPath, appleTouchBuf)

  await browser.close()

  // Build standard ICO binary container
  const count = pngBuffers.length
  const headerSize = 6
  const dirEntrySize = 16
  let offset = headerSize + count * dirEntrySize

  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(count, 4)

  const entries = []
  for (const img of pngBuffers) {
    const entry = Buffer.alloc(dirEntrySize)
    entry.writeUInt8(img.size >= 256 ? 0 : img.size, 0)
    entry.writeUInt8(img.size >= 256 ? 0 : img.size, 1)
    entry.writeUInt8(0, 2)
    entry.writeUInt8(0, 3)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(img.buffer.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    offset += img.buffer.length
  }

  const icoBuffer = Buffer.concat([header, ...entries, ...pngBuffers.map(p => p.buffer)])
  fs.writeFileSync(icoPath, icoBuffer)
  console.log(`Generated favicon.ico (${icoBuffer.length} bytes) and apple-touch-icon.png from icon.svg`)
}

// Execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateFavicons().catch(err => {
    console.error('Error generating favicons:', err)
    process.exit(1)
  })
}
