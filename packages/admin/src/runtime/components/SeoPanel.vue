<!-- How a routable entry shows in search results and when shared, and what would improve it. The checks
     are advice: saving is never blocked. -->
<script setup lang="ts">
import type { SeoInput } from '../composables/useAtelierSeo'
import { SEO_LIMITS, useAtelierSeo } from '../composables/useAtelierSeo'
import CnAlert from '../crystal-neuo/components/Alert.vue'
import { useAdminI18n } from '../i18n'

const props = defineProps<{ input: SeoInput }>()
const { t } = useAdminI18n()
const { search, social, robots, checks } = useAtelierSeo(() => props.input)
const limits = { min: SEO_LIMITS.descriptionMin, max: SEO_LIMITS.description }
</script>

<template>
  <section
    class="app-section app-seo"
    data-seo-panel
  >
    <h2 class="app-section__title">
      {{ t('seo.title') }}
    </h2>
    <div class="app-seo__previews">
      <figure class="cn-card cn-card--raised cn-card--size-sm app-seo__search">
        <figcaption class="cn-label">
          {{ t('seo.search') }}
        </figcaption>
        <p class="app-seo__url">
          {{ search.url }}
        </p>
        <p class="app-seo__headline">
          {{ search.title }}
        </p>
        <p class="app-muted">
          {{ search.description || t('seo.noDescription') }}
        </p>
      </figure>
      <figure class="cn-card cn-card--raised cn-card--size-sm app-seo__social">
        <figcaption class="cn-label">
          {{ t('seo.social') }}
        </figcaption>
        <img
          v-if="social.image"
          :src="social.image"
          alt=""
          class="app-seo__image"
        >
        <p class="app-seo__headline">
          {{ social.title }}
        </p>
        <p class="app-muted">
          {{ social.description }}
        </p>
      </figure>
    </div>
    <p
      v-if="robots?.includes('noindex')"
      class="app-muted"
    >
      {{ t('seo.noindex') }}
    </p>
    <ul
      v-if="checks.length"
      class="app-list"
      data-seo-checks
    >
      <li
        v-for="check in checks"
        :key="check"
      >
        <CnAlert variant="warning">
          {{ t(`seo.check.${check}`, check === 'title-long' ? { max: SEO_LIMITS.title } : limits) }}
        </CnAlert>
      </li>
    </ul>
    <p
      v-else
      class="app-muted"
    >
      {{ t('seo.allGood') }}
    </p>
  </section>
</template>
