import { createApp } from 'vue'
import { createPinia } from 'pinia'

import './assets/main.css'
import App from './App.vue'
import router from './router'

// Ignorer kjente interne feil fra Chrome DevTools Live Metrics (INP-måler / entries[0].startTime)
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    const msg = event.message || ''
    const stack = event.error?.stack || ''
    if (
      msg.includes("reading 'startTime'") ||
      msg.includes('reading "startTime"') ||
      stack.includes('devToolsReportSoftNavs') ||
      stack.includes('onEachInteraction')
    ) {
      event.stopImmediatePropagation()
      event.preventDefault()
    }
  })
}

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
