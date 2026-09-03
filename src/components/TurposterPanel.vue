<script setup lang="ts">
import { ref } from 'vue'
import { 
  Mountain, 
  Search, 
  ChevronRight, 
  X, 
  Loader2,
  Navigation2
} from 'lucide-vue-next'
import type { FylkeInfo, KommuneInfo, TurpostItem } from '@/composables/useTurposter'

const props = defineProps<{
  isOpen: boolean
  hierarchy: FylkeInfo[]
  selectedFylke: FylkeInfo | null
  selectedKommune: KommuneInfo | null
  turposter: TurpostItem[]
  filteredTurposter: TurpostItem[]
  isLoadingHierarchy: boolean
  isLoadingPosts: boolean
  searchQuery: string
  isLoggedIn?: boolean
  visitedTurpostIds?: Set<string>
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'select-fylke', fylke: FylkeInfo | null): void
  (e: 'select-kommune', kommune: KommuneInfo | null): void
  (e: 'update:searchQuery', val: string): void
  (e: 'focus-post', post: TurpostItem): void
  (e: 'view-checkins', post: TurpostItem): void
  (e: 'clear-all'): void
}>()

const fylkeFilter = ref('')
const kommuneFilter = ref('')

const filteredFylker = () => {
  if (!fylkeFilter.value.trim()) return props.hierarchy
  const q = fylkeFilter.value.toLowerCase().trim()
  return props.hierarchy.filter(f => f.name.toLowerCase().includes(q))
}

const filteredKommunerList = () => {
  if (!props.selectedFylke) return []
  if (!kommuneFilter.value.trim()) return props.selectedFylke.kommuner
  const q = kommuneFilter.value.toLowerCase().trim()
  return props.selectedFylke.kommuner.filter(k => k.name.toLowerCase().includes(q))
}
</script>

<template>
  <transition name="fade-slide">
    <div v-if="isOpen" class="turposter-panel">
      <!-- Header -->
      <div class="panel-header">
        <div class="header-title">
          <Mountain :size="20" class="header-icon" />
          <h3>Turposter i Norge</h3>
        </div>
        <button class="btn-close" @click="emit('close')" title="Lukk panel">
          <X :size="18" />
        </button>
      </div>

      <!-- Trinnvis navigasjonslinje / Brødsmuler -->
      <div class="breadcrumbs">
        <button 
          class="crumb-btn" 
          :class="{ active: !selectedFylke }"
          @click="emit('select-fylke', null)"
        >
          Hele landet
        </button>
        <span v-if="selectedFylke" class="crumb-sep">/</span>
        <button 
          v-if="selectedFylke" 
          class="crumb-btn"
          :class="{ active: selectedFylke && !selectedKommune }"
          @click="emit('select-kommune', null)"
        >
          {{ selectedFylke.name }}
        </button>
        <span v-if="selectedKommune" class="crumb-sep">/</span>
        <span v-if="selectedKommune" class="crumb-text active">
          {{ selectedKommune.name }}
        </span>
      </div>

      <!-- Innhold etter tilstand -->
      <div class="panel-body">
        <!-- Laster fylkesdata -->
        <div v-if="isLoadingHierarchy" class="loading-state">
          <Loader2 :size="24" class="spin-icon" />
          <span>Laster inn fylker og kommuner...</span>
        </div>

        <!-- Trinn 1: Velg Fylke -->
        <div v-else-if="!selectedFylke" class="step-container">
          <div class="step-desc">
            <span class="step-label">Trinn 1: Velg fylke</span>
            <div class="search-input-wrapper">
              <Search :size="15" class="search-icon" />
              <input 
                v-model="fylkeFilter" 
                type="text" 
                placeholder="Søk etter fylke..." 
                class="search-input"
              />
              <button v-if="fylkeFilter" class="btn-clear-search" @click="fylkeFilter = ''">✕</button>
            </div>
          </div>

          <div class="items-list scrollable">
            <button 
              v-for="fylke in filteredFylker()" 
              :key="fylke.slug"
              class="selection-item"
              @click="emit('select-fylke', fylke)"
            >
              <div class="item-main">
                <span class="item-name">{{ fylke.name }}</span>
                <span class="item-count">{{ fylke.count.toLocaleString('no') }} poster</span>
              </div>
              <ChevronRight :size="16" class="chevron-icon" />
            </button>
          </div>
        </div>

        <!-- Trinn 2: Velg Kommune i valgt Fylke -->
        <div v-else-if="selectedFylke && !selectedKommune" class="step-container">
          <div class="step-desc">
            <span class="step-label">Trinn 2: Velg kommune i {{ selectedFylke.name }}</span>
            <div class="search-input-wrapper">
              <Search :size="15" class="search-icon" />
              <input 
                v-model="kommuneFilter" 
                type="text" 
                placeholder="Søk etter kommune..." 
                class="search-input"
              />
              <button v-if="kommuneFilter" class="btn-clear-search" @click="kommuneFilter = ''">✕</button>
            </div>
          </div>

          <div class="items-list scrollable">
            <button 
              v-for="kommune in filteredKommunerList()" 
              :key="kommune.slug"
              class="selection-item"
              @click="emit('select-kommune', kommune)"
            >
              <div class="item-main">
                <span class="item-name">{{ kommune.name }}</span>
                <span class="item-count">{{ kommune.count }} poster</span>
              </div>
              <ChevronRight :size="16" class="chevron-icon" />
            </button>
          </div>
        </div>

        <!-- Trinn 3: Viser poster for valgt Kommune -->
        <div v-else-if="selectedFylke && selectedKommune" class="step-container">
          <div v-if="isLoadingPosts" class="loading-state">
            <Loader2 :size="24" class="spin-icon" />
            <span>Henter turposter for {{ selectedKommune.name }}...</span>
          </div>

          <div v-else class="posts-view">
            <div class="posts-header">
              <div class="posts-summary">
                <span class="count-highlight">{{ filteredTurposter.length }}</span>
                <span>turposter vises på kartet i <strong>{{ selectedKommune.name }}</strong></span>
              </div>

              <div class="search-input-wrapper">
                <Search :size="15" class="search-icon" />
                <input 
                  :value="searchQuery" 
                  @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
                  type="text" 
                  placeholder="Søk etter topp / turpost..." 
                  class="search-input"
                />
                <button v-if="searchQuery" class="btn-clear-search" @click="emit('update:searchQuery', '')">✕</button>
              </div>
            </div>

            <div class="items-list scrollable">
              <div 
                v-for="post in filteredTurposter" 
                :key="post.id"
                class="post-item"
                @click="emit('focus-post', post)"
              >
                <div class="post-info">
                  <span class="post-title">{{ post.name }}</span>
                  <div class="post-meta">
                    <span v-if="isLoggedIn && visitedTurpostIds?.has(String(post.id))" class="visited-tag" title="Du har besøkt denne posten">✓ Besøkt</span>
                    <span v-if="post.alt" class="alt-tag">⛰️ {{ post.alt }} moh.</span>
                    <span class="coord-tag">{{ post.lat.toFixed(4) }}°, {{ post.lng.toFixed(4) }}°</span>
                  </div>
                </div>
                <div class="post-actions-wrap">
                  <button
                    v-if="isLoggedIn"
                    class="btn-view-list"
                    @click.stop="emit('view-checkins', post)"
                    title="Vis innsjekkinger for denne turposten"
                  >
                    👁️
                  </button>
                  <button class="btn-focus" title="Sentrer kartet på denne posten">
                    <Navigation2 :size="16" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bunnkontroll i panelet -->
      <div v-if="selectedKommune" class="panel-footer">
        <button class="btn-change" @click="emit('select-kommune', null)">
          Bytt kommune
        </button>
        <button class="btn-clear" @click="emit('clear-all')">
          Skjul fra kart
        </button>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.turposter-panel {
  position: absolute;
  top: calc(72px + env(safe-area-inset-top, 0px));
  right: calc(16px + env(safe-area-inset-right, 0px));
  width: 380px;
  max-width: calc(100vw - 32px);
  max-height: calc(100dvh - 150px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  z-index: 25;
  overflow: hidden;
  padding: 0;
  background: #0f172a; /* Helt ugjennomsiktig bakgrunn */
  border: 1px solid #334155;
  border-radius: 16px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.75);
  pointer-events: auto;
  color: #f8fafc;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #334155;
  background: #1e293b;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-icon {
  color: #38bdf8;
}

.header-title h3 {
  font-size: 15px;
  font-weight: 700;
  color: #f8fafc;
}

.btn-close {
  background: #334155;
  border: none;
  color: #cbd5e1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.btn-close:hover {
  color: white;
  background: #475569;
}

/* Brødsmuler */
.breadcrumbs {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  font-size: 12px;
  background: #0b1120;
  border-bottom: 1px solid #334155;
}

.crumb-btn {
  background: none;
  border: none;
  color: #38bdf8;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.crumb-btn:hover {
  text-decoration: underline;
}

.crumb-btn.active, .crumb-text.active {
  color: #f8fafc;
  font-weight: 700;
}

.crumb-sep {
  color: #64748b;
}

/* Body */
.panel-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 14px 16px;
  background: #0f172a;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px 16px;
  color: #94a3b8;
  font-size: 13px;
}

.step-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  gap: 12px;
}

.step-desc {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.step-label {
  font-size: 13px;
  font-weight: 600;
  color: #e2e8f0;
}

.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 12px;
  color: #94a3b8;
}

.search-input {
  width: 100%;
  background: #1e293b;
  border: 1px solid #475569;
  border-radius: 10px;
  padding: 9px 32px 9px 34px;
  color: #ffffff;
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
}

.search-input:focus {
  border-color: #38bdf8;
  background: #1e293b;
}

.search-input::placeholder {
  color: #94a3b8;
}

.btn-clear-search {
  position: absolute;
  right: 10px;
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 12px;
  cursor: pointer;
  padding: 2px;
}

.scrollable {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 4px;
}

.scrollable::-webkit-scrollbar {
  width: 6px;
}

.scrollable::-webkit-scrollbar-thumb {
  background: #334155;
  border-radius: 4px;
}

.selection-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 10px;
  color: #f8fafc;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
}

.selection-item:hover {
  background: #0284c7;
  border-color: #38bdf8;
  color: #ffffff;
}

.selection-item:hover .item-count,
.selection-item:hover .chevron-icon {
  color: #e0f2fe;
}

.item-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-name {
  font-size: 14px;
  font-weight: 600;
}

.item-count {
  font-size: 12px;
  color: #94a3b8;
}

.chevron-icon {
  color: #94a3b8;
}

/* Visning av turposter */
.posts-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  gap: 10px;
}

.posts-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.posts-summary {
  font-size: 13px;
  color: #cbd5e1;
  background: #1e293b;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid #334155;
}

.count-highlight {
  color: #38bdf8;
  font-weight: 700;
  margin-right: 4px;
}

.post-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.post-item:hover {
  background: #1e3a5f;
  border-color: #38bdf8;
}

.post-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.post-title {
  font-size: 13px;
  font-weight: 600;
  color: #f8fafc;
}

.post-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}

.alt-tag {
  color: #34d399;
  font-weight: 600;
  background: rgba(16, 185, 129, 0.15);
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.visited-tag {
  color: #34d399;
  font-weight: 700;
  background: rgba(16, 185, 129, 0.2);
  border: 1px solid rgba(16, 185, 129, 0.4);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
}

.btn-view-list {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #f8fafc;
  font-size: 12px;
  padding: 4px 7px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-view-list:hover {
  background: rgba(255, 255, 255, 0.18);
}

.post-actions-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.btn-focus {
  background: #334155;
  border: none;
  color: #38bdf8;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;
}

.btn-focus:hover {
  background: #38bdf8;
  color: #0f172a;
}

/* Footer */
.panel-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-top: 1px solid #334155;
  background: #1e293b;
  gap: 10px;
}

.btn-change, .btn-clear {
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
  border: none;
  font-weight: 600;
  transition: all 0.15s ease;
}

.btn-change {
  background: #334155;
  color: #f8fafc;
}

.btn-change:hover {
  background: #475569;
}

.btn-clear {
  background: rgba(239, 68, 68, 0.2);
  color: #fca5a5;
  border: 1px solid #ef4444;
}

.btn-clear:hover {
  background: #ef4444;
  color: white;
}

.spin-icon {
  animation: spin 1.5s linear infinite;
  color: #38bdf8;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.2s ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
