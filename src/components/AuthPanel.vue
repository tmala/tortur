<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useAuth } from '@/composables/useAuth'
import { LogOut, LogIn, Shield, User, Loader2, AlertCircle, X } from 'lucide-vue-next'

const { user, isLoggedIn, isLoading, error, login, logout } = useAuth()

const emit = defineEmits<{
  (e: 'open-profile'): void
}>()

const showPanel = ref(false)

const handleLogin = async () => {
  showPanel.value = false
  await login()
  if (isLoggedIn.value) {
    showPanel.value = false
  }
}

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    if (showPanel.value) showPanel.value = false
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div class="auth-root">
    <!-- Innlogget: Avatar åpner profilvisning -->
    <div v-if="isLoggedIn && user" class="auth-dropdown-wrapper">
      <button
        class="auth-avatar-btn"
        :title="`Min profil (${user.userName}) - klikk for å se besøkte turposter og logge ut`"
        @click="emit('open-profile')"
      >
        <img
          v-if="user.avatarUrl"
          :src="user.avatarUrl"
          :alt="user.userName"
          class="auth-avatar-img"
          referrerpolicy="no-referrer"
        />
        <span v-else class="auth-avatar-fallback">
          <User :size="18" />
        </span>
        <span class="auth-online-dot" />
      </button>
    </div>

    <!-- Ikke innlogget: Login-knapp -->
    <button
      v-else
      class="auth-login-btn"
      :disabled="isLoading"
      title="Logg inn med Google"
      @click="showPanel = true"
    >
      <Loader2 v-if="isLoading" :size="16" class="spin-icon" />
      <Shield v-else :size="16" />
      <span>{{ isLoading ? 'Logger inn…' : 'Logg inn' }}</span>
    </button>

    <!-- Teleport modal og toast til body slik at de posisjoneres i forhold til vinduet og sentreres perfekt -->
    <Teleport to="body">
      <!-- Feilmelding (etter mislykket login) -->
      <transition name="fade">
        <div v-if="error" class="auth-error-toast glass-panel">
          <AlertCircle :size="16" class="error-icon" />
          <span>{{ error }}</span>
          <button class="error-close" @click="error = null" title="Lukk melding">
            <X :size="14" />
          </button>
        </div>
      </transition>

      <!-- Login-modal -->
      <transition name="modal-fade">
        <div 
          v-if="showPanel && !isLoggedIn" 
          class="auth-modal-overlay" 
          @click.self="showPanel = false"
        >
          <div class="auth-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
            <button 
              class="auth-modal-close" 
              @click="showPanel = false" 
              title="Lukk vindu (Esc)" 
              aria-label="Lukk vindu"
            >
              <X :size="20" />
            </button>

            <div class="auth-modal-logo">
              <Shield :size="40" class="auth-shield-icon" />
            </div>

            <h2 id="auth-modal-title" class="auth-modal-title">Logg inn på TorTur</h2>
            <p class="auth-modal-subtitle">
              Innlogging gir tilgang til sanntids AIS-båttrafikk og personlige innstillinger.
            </p>

            <div class="auth-modal-actions">
              <!-- Fallback: renderes av GIS -->
              <div id="google-signin-btn" class="google-btn-container" />

              <!-- Visuell Google-knapp (trigger GIS prompt) -->
              <button
                class="auth-google-btn"
                :disabled="isLoading"
                @click="handleLogin"
              >
                <svg class="google-logo" viewBox="0 0 24 24" width="20" height="20">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span>{{ isLoading ? 'Vent litt…' : 'Fortsett med Google' }}</span>
                <Loader2 v-if="isLoading" :size="16" class="spin-icon" />
              </button>
            </div>

            <p class="auth-modal-note">
              Kun forhåndsgodkjente e-postadresser kan logge inn.
            </p>

            <button class="auth-modal-cancel-btn" @click="showPanel = false">
              Lukk
            </button>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* ===== Root ===== */
.auth-root {
  position: relative;
  display: flex;
  align-items: center;
}

/* ===== Avatar-knapp (innlogget) ===== */
.auth-avatar-btn {
  position: relative;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 2px solid rgba(56, 189, 248, 0.5);
  background: rgba(15, 23, 42, 0.8);
  cursor: pointer;
  padding: 0;
  overflow: visible;
  transition: border-color 0.2s;
}
.auth-avatar-btn:hover {
  border-color: #38bdf8;
}
.auth-avatar-img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}
.auth-avatar-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: #94a3b8;
}
.auth-online-dot {
  position: absolute;
  bottom: 1px;
  right: 1px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #22c55e;
  border: 2px solid #0f172a;
}

/* ===== Dropdown ===== */
.auth-dropdown-wrapper {
  position: relative;
}
.auth-dropdown {
  position: absolute;
  top: calc(100% + 10px);
  left: 0;
  right: auto;
  min-width: 220px;
  padding: 12px;
  border-radius: 12px;
  z-index: 9999;
  backdrop-filter: blur(16px);
  background: rgba(15, 23, 42, 0.96);
  border: 1px solid rgba(56, 189, 248, 0.25);
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}
.auth-dropdown-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.auth-dropdown-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid rgba(56,189,248,0.3);
}
.auth-dropdown-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}
.auth-dropdown-name {
  font-size: 13px;
  font-weight: 600;
  color: #f1f5f9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.auth-dropdown-email {
  font-size: 11px;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.auth-dropdown-divider {
  height: 1px;
  background: rgba(255,255,255,0.08);
  margin: 8px 0;
}
.auth-dropdown-logout {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: #f87171;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
}
.auth-dropdown-logout:hover {
  background: rgba(248, 113, 113, 0.12);
}

/* ===== Login-knapp (ikke innlogget – heldekkende/ikke gjennomsiktig) ===== */
.auth-login-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid #38bdf8;
  background: linear-gradient(135deg, #0284c7, #0369a1);
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(2, 132, 199, 0.4);
}
.auth-login-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #0369a1, #0284c7);
  border-color: #7dd3fc;
  color: #ffffff;
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(2, 132, 199, 0.5);
}
.auth-login-btn:active:not(:disabled) {
  transform: translateY(0);
}
.auth-login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ===== Feilmelding ===== */
.auth-error-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: flex-start;
  gap: 10px;
  max-width: 380px;
  padding: 14px 16px;
  border-radius: 12px;
  background: rgba(30, 10, 10, 0.92);
  border: 1px solid rgba(248, 113, 113, 0.4);
  color: #fca5a5;
  font-size: 13px;
  z-index: 10000;
  box-shadow: 0 4px 24px rgba(0,0,0,0.5);
}
.error-icon { color: #f87171; flex-shrink: 0; margin-top: 2px; }
.error-close {
  margin-left: auto;
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
}

/* ===== Login-modal ===== */
.auth-modal-overlay {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 16px;
  box-sizing: border-box;
}
.auth-modal {
  position: relative;
  width: 100%;
  max-width: 380px;
  padding: 36px 28px 24px;
  border-radius: 20px;
  background: rgba(15, 23, 42, 0.98);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(56, 189, 248, 0.25);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
  text-align: center;
  box-sizing: border-box;
}
.auth-modal-close {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #94a3b8;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.2s ease;
}
.auth-modal-close:hover { 
  background: rgba(255, 255, 255, 0.16);
  color: #ffffff; 
  transform: scale(1.05);
}

.auth-modal-cancel-btn {
  margin-top: 18px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #94a3b8;
  padding: 8px 24px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}
.auth-modal-cancel-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #f1f5f9;
}

.auth-modal-logo { margin-bottom: 16px; }
.auth-shield-icon { color: #38bdf8; }

.auth-modal-title {
  font-size: 20px;
  font-weight: 700;
  color: #f1f5f9;
  margin: 0 0 8px;
}
.auth-modal-subtitle {
  font-size: 13px;
  color: #64748b;
  margin: 0 0 24px;
  line-height: 1.5;
}

.auth-modal-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.google-btn-container { min-height: 0; }

.auth-google-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  padding: 12px 20px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.15);
  background: rgba(255, 255, 255, 0.06);
  color: #e2e8f0;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}
.auth-google-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255,255,255,0.3);
}
.auth-google-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.google-logo { flex-shrink: 0; }

.auth-modal-note {
  font-size: 11px;
  color: #475569;
  margin: 16px 0 0;
}

/* ===== Animasjoner ===== */
.spin-icon { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.dropdown-fade-enter-active,
.dropdown-fade-leave-active { transition: opacity 0.15s, transform 0.15s; }
.dropdown-fade-enter-from,
.dropdown-fade-leave-to { opacity: 0; transform: translateY(-6px); }

.modal-fade-enter-active,
.modal-fade-leave-active { transition: opacity 0.2s; }
.modal-fade-enter-from,
.modal-fade-leave-to { opacity: 0; }

.fade-enter-active,
.fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }
</style>
