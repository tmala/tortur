<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

onMounted(() => {
  router.replace({ path: '/profil/spor', query: route.query })
})
</script>

<template>
  <div />
</template>
