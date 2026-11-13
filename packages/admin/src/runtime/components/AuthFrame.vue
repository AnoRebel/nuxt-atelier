<!-- Sign-in and first-run setup: the name and a short pitch on a material-tinted panel, the form on a glass
     card beside it (the licenses app's auth layout). -->
<script setup lang="ts">
import { useAppearance } from '../appearance'
import { useOverrides } from '../overrides'
import Brand from './Brand.vue'
import Icon from './Icon'
import { useAdminI18n } from '../i18n'

const { t } = useAdminI18n()

const { openModal } = useAppearance()
const brand = useOverrides()('Brand', Brand)
</script>

<template>
  <div class="app-auth">
    <aside
      class="app-auth__brand"
      :aria-label="t('auth.about')"
    >
      <div class="app-auth__brand-top">
        <component :is="brand" />
        <button
          type="button"
          class="app-icon-button"
          :aria-label="t('common.appearance')"
          aria-haspopup="dialog"
          @click="openModal"
        >
          <Icon name="palette" />
        </button>
      </div>
      <div class="app-auth__pitch">
        <p class="app-auth__headline">
          {{ t('auth.pitch') }}
        </p>
        <ul class="app-auth__points">
          <li><Icon name="check" />{{ t('auth.point1') }}</li>
          <li><Icon name="check" />{{ t('auth.point2') }}</li>
          <li><Icon name="check" />{{ t('auth.point3') }}</li>
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
