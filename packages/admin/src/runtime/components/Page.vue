<!-- A view inside the shell: title (or breadcrumb), description, actions, an optional toolbar, the body. -->
<script setup lang="ts">
import { NuxtLink } from '#components'
import Icon from './Icon'
import { useAdminI18n } from '../i18n'

defineProps<{ title: string, icon?: string, description?: string, breadcrumb?: { label: string, to?: string }[] }>()
const { t } = useAdminI18n()
</script>

<template>
  <section
    class="app-page"
    aria-labelledby="atelier-page-title"
  >
    <nav
      v-if="breadcrumb?.length"
      class="cn-breadcrumb cn-breadcrumb--size-sm"
      :aria-label="t('common.breadcrumb')"
    >
      <ol class="cn-breadcrumb__list">
        <li
          v-for="(c, i) in breadcrumb"
          :key="i"
          class="cn-breadcrumb__item"
        >
          <NuxtLink
            v-if="c.to"
            :to="c.to"
            class="cn-breadcrumb__link"
          >
            {{ c.label }}
          </NuxtLink>
          <span
            v-else
            class="cn-breadcrumb__current"
            aria-current="page"
          >{{ c.label }}</span>
          <span
            v-if="i !== breadcrumb.length - 1"
            class="cn-breadcrumb__sep"
            aria-hidden="true"
          >/</span>
        </li>
      </ol>
    </nav>
    <div class="app-page__head">
      <div>
        <h1
          id="atelier-page-title"
          class="app-page__title"
        >
          <Icon
            v-if="icon"
            :name="icon"
          />
          {{ title }}
        </h1>
        <p
          v-if="description"
          class="app-page__description"
        >
          {{ description }}
        </p>
      </div>
      <div
        v-if="$slots.actions"
        class="app-page__actions"
      >
        <slot name="actions" />
      </div>
    </div>
    <div
      v-if="$slots.toolbar"
      class="app-page__toolbar"
    >
      <slot name="toolbar" />
    </div>
    <slot />
  </section>
</template>
