<!-- Sign-in and first-run setup: the name and a short pitch on a material-tinted panel, the form on a glass
     card beside it (the licenses app's auth layout). -->
<script setup lang="ts">
import { useAppearance } from '../appearance'
import { useOverrides } from '../overrides'
import Brand from './Brand.vue'
import Icon from './Icon'

const { openModal } = useAppearance()
const brand = useOverrides()('Brand', Brand)
</script>

<template>
  <div class="app-auth">
    <aside
      class="app-auth__brand"
      aria-label="About"
    >
      <div class="app-auth__brand-top">
        <component :is="brand" />
        <button
          type="button"
          class="app-icon-button"
          aria-label="Appearance"
          aria-haspopup="dialog"
          @click="openModal"
        >
          <Icon name="palette" />
        </button>
      </div>
      <div class="app-auth__pitch">
        <p class="app-auth__headline">
          Your site's content, in one place.
        </p>
        <ul class="app-auth__points">
          <li><Icon name="check" />Pages, posts and settings</li>
          <li><Icon name="check" />Drafts, history and publishing</li>
          <li><Icon name="check" />Roles for everyone who edits</li>
        </ul>
      </div>
      <div
        class="app-auth__shapes"
        aria-hidden="true"
      >
        <span /><span /><span />
      </div>
    </aside>
    <main
      class="app-auth__main"
      tabindex="-1"
    >
      <div class="app-auth__card cn-glass">
        <slot />
      </div>
    </main>
  </div>
</template>
