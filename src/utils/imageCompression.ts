/**
 * Bildekomprimering og nedskalering for TorTur
 * Komprimerer og nedskalerer bildet umiddelbart ved valg for å unngå minneproblemer på mobil/Android
 */

export async function compressImage(
  file: File,
  maxDim = 1024,
  quality = 0.8
): Promise<File> {
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
          quality
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
        quality
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
