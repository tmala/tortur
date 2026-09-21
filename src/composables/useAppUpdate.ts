/**
 * useAppUpdate – detekterer om en ny versjon av appen er tilgjengelig via Service Worker.
 *
 * Bruker `useRegisterSW` fra vite-plugin-pwa sin Vue-integrasjon.
 * `needRefresh` blir `true` automatisk når Service Worker-en har lastet ned en ny versjon
 * i bakgrunnen og er klar til å ta over.
 *
 * `applyUpdate()` ber Service Worker-en ta over og laster siden på nytt.
 */

import { ref } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'

export function useAppUpdate() {
  const isUpdating = ref(false)

  const { needRefresh, updateServiceWorker } = useRegisterSW({
    // Sjekk automatisk etter oppdatering hvert 60. minutt
    onRegisteredSW(_swUrl: string, reg: ServiceWorkerRegistration | undefined) {
      if (reg) {
        setInterval(() => {
          reg.update().catch(() => {})
        }, 60 * 60 * 1000)
      }
    }
  })

  const applyUpdate = async () => {
    if (isUpdating.value) return
    isUpdating.value = true

    try {
      // 1. Send SKIP_WAITING direkte til alle registrerte service workers i waiting-tilstand
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        for (const reg of registrations) {
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' })
          }
        }
      }

      // 2. Be også vite-plugin-pwa / workbox om å oppdatere
      await updateServiceWorker(true)
    } catch (err) {
      console.warn('[useAppUpdate] Feil under aktivering av oppdatering:', err)
    } finally {
      // 3. Nullstill varselet og tving omlasting
      needRefresh.value = false

      // Vent et lite øyeblikk så skipWaiting rekker å ta over, deretter last inn på nytt
      setTimeout(() => {
        window.location.reload()
      }, 250)
    }
  }

  return {
    /** true når en ny versjon er lastet ned og klar */
    needsUpdate: needRefresh,
    isUpdating,
    /** Kall denne for å aktivere ny versjon og laste appen på nytt */
    applyUpdate
  }
}
