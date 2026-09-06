/**
 * useAppUpdate – detekterer om en ny versjon av appen er tilgjengelig via Service Worker.
 *
 * Bruker `useRegisterSW` fra vite-plugin-pwa sin Vue-integrasjon.
 * `needRefresh` blir `true` automatisk når Service Worker-en har lastet ned en ny versjon
 * i bakgrunnen og er klar til å ta over.
 *
 * `applyUpdate()` ber Service Worker-en ta over og laster siden på nytt.
 */

import { useRegisterSW } from 'virtual:pwa-register/vue'

export function useAppUpdate() {
  const { needRefresh, updateServiceWorker } = useRegisterSW({
    // Sjekk automatisk etter oppdatering hvert 60. minutt
    onRegisteredSW(_swUrl: string, reg: ServiceWorkerRegistration | undefined) {
      if (reg) {
        setInterval(() => {
          reg.update()
        }, 60 * 60 * 1000)
      }
    }
  })

  const applyUpdate = async () => {
    await updateServiceWorker(true)
  }

  return {
    /** true når en ny versjon er lastet ned og klar */
    needsUpdate: needRefresh,
    /** Kall denne for å aktivere ny versjon og laste appen på nytt */
    applyUpdate
  }
}
