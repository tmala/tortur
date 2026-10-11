<template>
  <Teleport to="body">
    <div v-if="isOpen" class="modal-overlay">
      <div
        ref="modalRef"
        class="modal-card glass-panel"
        :class="{ 'is-dragging': isDragging }"
        :style="modalStyle"
        role="dialog"
        aria-modal="true"
        aria-labelledby="suggestions-title"
      >
        <!-- Header -->
        <div class="modal-header" @pointerdown="startDrag" title="Klikk og dra for å flytte dialogen">
          <div class="modal-title-row">
            <div class="modal-icon-badge">📋</div>
            <div>
              <h2 id="suggestions-title">Innkommende forslag til turposter</h2>
              <p class="modal-subtitle">
                {{ suggestions.length }} {{ suggestions.length === 1 ? 'forslag venter på godkjenning' : 'forslag venter på godkjenning' }}
              </p>
            </div>
          </div>
          <button class="btn-close" @click="emit('close')" aria-label="Lukk">✕</button>
        </div>

        <!-- Innhold -->
        <div class="modal-body">
          <div v-if="isLoading" class="loading-state">
            <span class="spinner">⏳</span> Henter innkommende forslag...
          </div>

          <div v-else-if="suggestions.length === 0" class="empty-state">
            <div class="empty-icon">🏔️</div>
            <h3>Ingen nye forslag akkurat nå</h3>
            <p>Når brukere oppretter egne turposter og foreslår dem til appen, vil de dukke opp her for din vurdering.</p>
          </div>

          <div v-else class="suggestions-list">
            <div
              v-for="spot in suggestions"
              :key="spot.id"
              class="suggestion-item"
            >
              <div class="suggestion-header">
                <div class="suggestion-main-info">
                  <h3 class="suggestion-name">{{ spot.name }}</h3>
                  <span class="suggestion-alt">{{ spot.alt }} moh.</span>
                  <span class="suggestion-geo">{{ spot.kommune }}, {{ spot.fylke }}</span>
                </div>
                <div class="suggestion-meta">
                  <span class="meta-user">👤 {{ spot.userName || spot.userEmail || 'Innlogget bruker' }}</span>
                  <span class="meta-date">{{ formatDate(spot.suggestedAt) }}</span>
                </div>
              </div>

              <!-- Anbefalt plassering i mountains.csv -->
              <div v-if="getPlacement(spot.id)" class="placement-info">
                📍 <strong>Anbefalt linje i data/mountains.csv:</strong> Linje {{ getPlacement(spot.id)?.lineNumber }}
                <span v-if="getPlacement(spot.id)?.prevName">
                  (etter «{{ getPlacement(spot.id)?.prevName }}»)
                </span>
                <span v-if="getPlacement(spot.id)?.nextName">
                  og før «{{ getPlacement(spot.id)?.nextName }}»
                </span>
              </div>

              <!-- CSV-boks -->
              <div class="csv-container">
                <code class="csv-text">{{ spot.csvLine }}</code>
                <button
                  class="btn-copy"
                  :class="{ copied: copiedId === spot.id }"
                  @click="copyCsv(spot)"
                  title="Kopier CSV-linje"
                >
                  {{ copiedId === spot.id ? '✅ Kopiert!' : '📋 Kopier CSV' }}
                </button>
              </div>

              <!-- Handlinger -->
              <div class="suggestion-actions">
                <button
                  class="btn-view-map"
                  @click="emit('view-spot', spot)"
                  title="Vis og sentrer kartet på dette punktet"
                >
                  🗺️ Vis på kartet
                </button>

                <button
                  class="btn-deny-suggestion"
                  @click="handleDeny(spot)"
                  title="Avvis dette forslaget. Turposten merkes som avvist hos brukeren."
                >
                  ❌ Avvis forslag
                </button>

                <button
                  class="btn-approve-suggestion"
                  @click="handleApprove(spot)"
                  title="Godkjenn dette forslaget og publiser det til Firebase Realtime Database for alle innloggede brukere"
                >
                  ✅ Godkjenn og publiser
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="modal-footer">
          <div class="footer-note">
            💡 Godkjente turposter lagres i Firebase Realtime Database. Kjør <code>npm run sync:spots</code> for å oppdatere <code>data/mountains.csv</code> før neste bygg og distribusjon.
          </div>
          <button class="btn-primary" @click="emit('close')">Lukk</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useAuth } from '@/composables/useAuth'
import {
  usePrivateTurposter,
  type SpotSuggestion,
  type CsvPlacementResult
} from '@/composables/usePrivateTurposter'
import { useAppStateStore } from '@/stores/appState'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'view-spot', spot: SpotSuggestion): void
}>()

const { user } = useAuth()
const appState = useAppStateStore()
const {
  fetchSpotSuggestions,
  denySpotSuggestion,
  approveSpotSuggestion,
  calculateCsvPlacement
} = usePrivateTurposter()

const suggestions = ref<SpotSuggestion[]>([])
const isLoading = ref(false)
const copiedId = ref<string | null>(null)
const placementMap = ref<Record<string, CsvPlacementResult>>({})

// Dra/flytt-logikk for modalen
const modalRef = ref<HTMLElement | null>(null)
const isDragging = ref(false)
const dragPos = ref({ x: 0, y: 0 })
const dragStart = ref({ x: 0, y: 0, initialX: 0, initialY: 0 })

const modalStyle = computed(() => {
  if (dragPos.value.x === 0 && dragPos.value.y === 0) return {}
  return {
    transform: `translate3d(${dragPos.value.x}px, ${dragPos.value.y}px, 0)`
  }
})

function startDrag(e: PointerEvent) {
  const target = e.target as HTMLElement | null
  if (target?.closest('button') || target?.closest('a') || target?.closest('code')) return
  if (e.button !== 0) return
  isDragging.value = true
  dragStart.value = {
    x: e.clientX,
    y: e.clientY,
    initialX: dragPos.value.x,
    initialY: dragPos.value.y
  }
}

function onDragMove(e: PointerEvent) {
  if (!isDragging.value) return
  const dx = e.clientX - dragStart.value.x
  const dy = e.clientY - dragStart.value.y

  let newX = dragStart.value.initialX + dx
  let newY = dragStart.value.initialY + dy

  if (modalRef.value) {
    const rect = modalRef.value.getBoundingClientRect()
    const currentLeft = rect.left - dragPos.value.x
    const currentTop = rect.top - dragPos.value.y

    const minX = -currentLeft + 10
    const maxX = window.innerWidth - (currentLeft + 80)
    const minY = -currentTop + 10
    const maxY = window.innerHeight - (currentTop + 40)

    newX = Math.max(minX, Math.min(maxX, newX))
    newY = Math.max(minY, Math.min(maxY, newY))
  }

  dragPos.value = { x: newX, y: newY }
}

function onDragEnd() {
  isDragging.value = false
}

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && props.isOpen) {
    emit('close')
  }
}

function getPlacement(spotId: string): CsvPlacementResult | undefined {
  return placementMap.value[spotId]
}

async function loadSuggestions() {
  isLoading.value = true
  try {
    const list = await fetchSpotSuggestions()
    suggestions.value = list

    // Beregn anbefalt plassering for hver av dem
    for (const item of list) {
      if (!placementMap.value[item.id]) {
        calculateCsvPlacement(item.name).then((res) => {
          placementMap.value[item.id] = res
        })
      }
    }
  } finally {
    isLoading.value = false
  }
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      dragPos.value = { x: 0, y: 0 }
      loadSuggestions()
    }
  }
)

onMounted(() => {
  if (props.isOpen) {
    loadSuggestions()
  }
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd)
  window.addEventListener('pointercancel', onDragEnd)
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
  window.removeEventListener('keydown', handleKeyDown)
})

async function copyCsv(spot: SpotSuggestion) {
  try {
    await navigator.clipboard.writeText(spot.csvLine)
    copiedId.value = spot.id
    setTimeout(() => {
      if (copiedId.value === spot.id) copiedId.value = null
    }, 2500)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = spot.csvLine
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    copiedId.value = spot.id
    setTimeout(() => {
      if (copiedId.value === spot.id) copiedId.value = null
    }, 2500)
  }
}

async function handleApprove(spot: SpotSuggestion) {
  if (
    !confirm(
      `Vil du godkjenne og publisere forslaget «${spot.name}»?\n\nTurposten blir umiddelbart lagret i Firebase Realtime Database (approved_spots) og offentlig tilgjengelig for alle innloggede brukere!`
    )
  )
    return
  try {
    await approveSpotSuggestion(
      spot,
      user.value?.userName || user.value?.email || 'Admin'
    )
    suggestions.value = suggestions.value.filter((s) => s.id !== spot.id)
    appState.spotSuggestionsCount = suggestions.value.length
    appState.requestClearSpotSuggestion()
    alert(`«${spot.name}» er nå godkjent og publisert som offentlig turpost!`)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ukjent feil'
    alert(`Kunne ikke godkjenne forslaget: ${msg}`)
  }
}

async function handleDeny(spot: SpotSuggestion) {
  if (!confirm(`Vil du avvise forslaget «${spot.name}»?\n\nTurposten vil få status «Avvist» hos brukeren, og kan ikke foreslås som offentlig på nytt.`)) return
  try {
    await denySpotSuggestion(spot.id)
    suggestions.value = suggestions.value.filter((s) => s.id !== spot.id)
    appState.spotSuggestionsCount = suggestions.value.length
    appState.requestClearSpotSuggestion()
  } catch {
    alert('Kunne ikke avvise forslaget.')
  }
}

function formatDate(isoStr?: string): string {
  if (!isoStr) return ''
  try {
    const d = new Date(isoStr)
    return new Intl.DateTimeFormat('no-NO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(d)
  } catch {
    return isoStr
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 16px;
  pointer-events: none;
}

.modal-card {
  pointer-events: auto;
  background: rgba(30, 41, 59, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 20px;
  width: 100%;
  max-width: 680px;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.05);
  color: #f8fafc;
  transition: box-shadow 0.2s ease;
}

.modal-card.is-dragging {
  user-select: none;
  -webkit-user-select: none;
  box-shadow: 0 35px 80px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.25);
}

.modal-header {
  padding: 20px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}

.modal-header:active,
.modal-card.is-dragging .modal-header {
  cursor: grabbing;
}

.modal-title-row {
  display: flex;
  align-items: center;
  gap: 14px;
}

.modal-icon-badge {
  font-size: 24px;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: #f8fafc;
}

.modal-subtitle {
  margin: 2px 0 0;
  font-size: 0.85rem;
  color: #94a3b8;
}

.btn-close {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 8px;
  transition: background 0.2s;
}
.btn-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.modal-body {
  padding: 20px 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #94a3b8;
}

.empty-icon {
  font-size: 44px;
  margin-bottom: 12px;
}

.empty-state h3 {
  margin: 0 0 6px;
  color: #f1f5f9;
  font-size: 1.15rem;
}

.empty-state p {
  margin: 0 auto;
  max-width: 420px;
  font-size: 0.9rem;
  line-height: 1.5;
}

.suggestions-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.suggestion-item {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.suggestion-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 8px;
}

.suggestion-main-info {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.suggestion-name {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: #38bdf8;
}

.suggestion-alt {
  font-size: 0.85rem;
  background: rgba(56, 189, 248, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.3);
  color: #7dd3fc;
  padding: 2px 8px;
  border-radius: 6px;
}

.suggestion-geo {
  font-size: 0.85rem;
  color: #cbd5e1;
}

.suggestion-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-size: 0.78rem;
  color: #94a3b8;
  gap: 2px;
}

.placement-info {
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 0.85rem;
  color: #fef08a;
  line-height: 1.4;
}

.placement-info strong {
  color: #ffffff;
}

.csv-container {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 8px 12px;
}

.csv-text {
  flex: 1;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.78rem;
  color: #86efac;
  overflow-x: auto;
  white-space: nowrap;
}

.btn-copy {
  background: #1e293b;
  border: 1px solid #475569;
  border-radius: 6px;
  color: #cbd5e1;
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 600;
  padding: 6px 12px;
  white-space: nowrap;
  transition: all 0.2s;
}

.btn-copy:hover {
  background: #334155;
  color: #ffffff;
}

.btn-copy.copied {
  background: #10b981;
  border-color: #10b981;
  color: #ffffff;
}

.suggestion-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}

.btn-view-map {
  background: rgba(56, 189, 248, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.3);
  color: #38bdf8;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 0.82rem;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-view-map:hover {
  background: rgba(56, 189, 248, 0.25);
}

.btn-deny-suggestion {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #fca5a5;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-deny-suggestion:hover {
  background: rgba(239, 68, 68, 0.3);
  border-color: #ef4444;
  color: #ffffff;
}

.btn-delete-suggestion,
.btn-approve-suggestion {
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.35);
  color: #6ee7b7;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-delete-suggestion:hover,
.btn-approve-suggestion:hover {
  background: rgba(16, 185, 129, 0.3);
  border-color: #10b981;
  color: #ffffff;
}

.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.footer-note {
  font-size: 0.8rem;
  color: #94a3b8;
}

.footer-note code {
  color: #86efac;
  background: #0f172a;
  padding: 2px 6px;
  border-radius: 4px;
}

.btn-primary {
  background: #3b82f6;
  border: none;
  border-radius: 10px;
  color: #ffffff;
  padding: 8px 18px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-primary:hover {
  background: #2563eb;
}

.spinner {
  display: inline-block;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
