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
          component: () => import('../views/ProfileView.vue')
        },
        {
          path: 'venner',
          name: 'friends',
          component: () => import('../views/FriendsView.vue')
        },
        {
          path: 'venner/:userId',
          name: 'friend-profile',
          component: () => import('../views/FriendProfileView.vue')
        },
        {
          path: 'mine-turposter',
          name: 'my-spots',
          component: () => import('../views/MySpotsView.vue')
        },
        {
          path: 'gps-spor',
          name: 'gps-tracks',
          component: () => import('../views/GpsTracksView.vue')
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
