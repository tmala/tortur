import { createRouter, createWebHistory } from 'vue-router'
import MapView from '../views/MapView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: MapView,
      children: [
        {
          path: '',
          name: 'home',
          component: { render: () => null }
        },
        {
          path: 'profil',
          name: 'profile',
          component: () => import('../views/ProfileView.vue'),
          alias: ['profil/innsjekkinger']
        },
        {
          path: 'profil/spor',
          name: 'profile-tracks',
          component: () => import('../views/ProfileView.vue'),
          alias: ['gps-spor']
        },
        {
          path: 'profil/turposter',
          name: 'profile-spots',
          component: () => import('../views/ProfileView.vue'),
          alias: ['mine-turposter']
        },
        {
          path: 'profil/venner',
          name: 'profile-friends',
          component: () => import('../views/ProfileView.vue'),
          alias: ['venner']
        },
        {
          path: 'venner/:userId',
          name: 'friend-profile',
          component: () => import('../views/FriendProfileView.vue')
        },
        {
          path: 'forslag',
          name: 'spot-suggestions',
          component: () => import('../views/SpotSuggestionsView.vue')
        },
        {
          path: 'spor-3d',
          name: 'track-flyover',
          component: () => import('../views/TrackFlyoverView.vue')
        }
      ]
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

export default router
