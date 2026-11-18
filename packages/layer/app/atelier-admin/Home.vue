<!--
  The admin's home page: a starting point to make your own. Copy this file to app/atelier-admin/Home.vue in
  your app and change it; yours is used instead. It's plain Vue on the admin's headless composables, styled
  with crystal-neuo classes (https://crystal-neuo.anorebel.net).
-->
<script setup lang="ts">
const { items } = useAtelierNavigation()
const { user } = useAtelierSession()
</script>

<template>
  <section
    class="app-page"
    data-layer-home
  >
    <div class="app-page__head">
      <div>
        <h1 class="app-page__title">
          Welcome back
        </h1>
        <p class="app-page__description">
          Signed in as {{ user?.name || user?.email }}.
        </p>
      </div>
    </div>
    <ul class="app-cards">
      <li
        v-for="item in items.filter(i => i.group)"
        :key="item.to"
      >
        <NuxtLink
          :to="item.to"
          class="cn-card cn-card--glass cn-card--size-sm app-card-link"
        >
          {{ item.label }}
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>
