/**
 * Bildekomprimering og nedskalering for TorTur
 * Komprimerer og nedskalerer bildet umiddelbart ved valg for å unngå minneproblemer på mobil/Android
 * Bevarer EXIF/GPS-metadata fra original JPEG-fil via piexifjs
 */

import piexif from 'piexifjs'

/**
 * Komprimerer og eventuelt nedskalerer et bilde.
 * Returnerer en ny File uten EXIF (intern hjelpefunksjon).
 */
export async function compressImage(file: File, maxDim = 1024, quality = 0.8): Promise<File> {
  // Rask forhåndssjekk: hvis filen allerede er en liten JPEG, sjekk dimensjoner raskt
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      let { width, height } = bitmap

      if (
        width <= maxDim &&
        height <= maxDim &&
        file.size <= 300 * 1024 &&
        file.type === 'image/jpeg'
      ) {
        bitmap.close()
        return file
      }

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width)
          width = maxDim
        } else {
          width = Math.round((width * maxDim) / height)
          height = maxDim
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        bitmap.close()
        return file
      }

      ctx.drawImage(bitmap, 0, 0, width, height)
      bitmap.close() // Frigjør GPU-/dekodingsminne umiddelbart!

      return await new Promise<File>((resolve) => {
        canvas.toBlob(
          (blob) => {
            canvas.width = 0
            canvas.height = 0

            if (blob) {
              const cleanName = file.name.replace(/\.[^.]+$/, '') || 'innsjekk'
              resolve(new File([blob], `${cleanName}.jpg`, { type: 'image/jpeg' }))
            } else {
              resolve(file)
            }
          },
          'image/jpeg',
          quality,
        )
      })
    } catch {
      // Ved eventuelle feil med createImageBitmap, fall tilbake til new Image()
    }
  }

  // Fallback for eldre nettlesere
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      let width = img.width
      let height = img.height

      if (
        width <= maxDim &&
        height <= maxDim &&
        file.size <= 300 * 1024 &&
        file.type === 'image/jpeg'
      ) {
        img.src = ''
        img.onload = null
        resolve(file)
        return
      }

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width)
          width = maxDim
        } else {
          width = Math.round((width * maxDim) / height)
          height = maxDim
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        img.src = ''
        img.onload = null
        resolve(file)
        return
      }

      ctx.drawImage(img, 0, 0, width, height)
      img.src = ''
      img.onload = null

      canvas.toBlob(
        (blob) => {
          canvas.width = 0
          canvas.height = 0

          if (blob) {
            const cleanName = file.name.replace(/\.[^.]+$/, '') || 'innsjekk'
            resolve(new File([blob], `${cleanName}.jpg`, { type: 'image/jpeg' }))
          } else {
            resolve(file)
          }
        },
        'image/jpeg',
        quality,
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      img.src = ''
      img.onload = null
      resolve(file)
    }

    img.src = url
  })
}

/**
 * Leser EXIF-data fra en JPEG-fil som base64-dataURL.
 * Returnerer null hvis filen ikke er JPEG eller ikke har EXIF.
 */
async function readExifFromFile(file: File): Promise<string | null> {
  if (file.type !== 'image/jpeg') return null
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const dataUrl = reader.result as string
        // piexif.load() kaster exception hvis ingen EXIF finnes
        piexif.load(dataUrl)
        resolve(dataUrl)
      } catch {
        resolve(null)
      }
    }
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

/**
 * Komprimerer bildet og bevarer EXIF/GPS-metadata for JPEG-filer.
 * For PNG/WebP returneres komprimert JPEG uten EXIF (ingen metadata å bevare).
 * For webkamera-bilder bruk compressImage() direkte.
 */
export async function compressImageWithExif(
  file: File,
  maxDim = 1024,
  quality = 0.8,
): Promise<File> {
  // Les EXIF fra originalfilen før komprimering (kun JPEG)
  const originalDataUrl = await readExifFromFile(file)

  // Komprimer som vanlig
  const compressed = await compressImage(file, maxDim, quality)

  // Hvis vi ikke fikk EXIF, eller komprimert fil er identisk med original, returner direkte
  if (!originalDataUrl || compressed === file) {
    return compressed
  }

  // Les EXIF-objekt fra originalen
  let exifObj: ReturnType<typeof piexif.load>
  try {
    exifObj = piexif.load(originalDataUrl)
    // Fjern eventuell innebygd forhåndsvisning/thumbnail fra originalbildet
    // for å unngå at EXIF-seksjonen overskrider JPEGs 64KB APP1-grense
    if (exifObj.thumbnail) {
      delete exifObj.thumbnail
    }
    if (exifObj['1st']) {
      delete exifObj['1st']
    }
  } catch {
    return compressed
  }

  // Les komprimert fil som base64 og sett inn EXIF
  return new Promise<File>((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const compressedDataUrl = reader.result as string
        const exifBytes = piexif.dump(exifObj)
        const withExif = piexif.insert(exifBytes, compressedDataUrl)

        // Konverter tilbake fra base64 dataURL til Blob/File
        const base64 = withExif.split(',')[1]
        if (!base64) {
          resolve(compressed)
          return
        }
        const binary = atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i)
        }
        const blob = new Blob([bytes], { type: 'image/jpeg' })
        const cleanName = file.name.replace(/\.[^.]+$/, '') || 'innsjekk'
        resolve(new File([blob], `${cleanName}.jpg`, { type: 'image/jpeg' }))
      } catch {
        // Hvis EXIF-innsetting feiler, bruk komprimert bilde uten metadata
        resolve(compressed)
      }
    }
    reader.onerror = () => resolve(compressed)
    reader.readAsDataURL(compressed)
  })
}
