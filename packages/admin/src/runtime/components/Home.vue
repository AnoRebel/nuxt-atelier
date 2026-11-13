<!-- The admin home: pending migrations, failed jobs (with retry), the user's drafts, upcoming schedules,
     recent activity, and the content types. Replace it with app/atelier-admin/Home.vue. -->
<script setup lang="ts">
import type { AdminApiError } from '../types'
import { computed } from 'vue'
import { NuxtLink } from '#components'
import { useAtelierAdmin } from '../composables/useAtelierAdmin'
import { useAtelierAdminSchema } from '../composables/useAtelierAdminSchema'
import { titleField } from '../composables/useAtelierCollection'
import { useAtelierDashboard } from '../composables/useAtelierDashboard'
import { humanize, useAtelierNavigation } from '../composables/useAtelierNavigation'
import { useAtelierSession } from '../composables/useAtelierSession'
import CnAlert from '../crystal-neuo/components/Alert.vue'
import CnBadge from '../crystal-neuo/components/Badge.vue'
import CnButton from '../crystal-neuo/components/Button.vue'
import { useAdminToast } from '../toast'
import Icon from './Icon'
import Page from './Page.vue'
import { useAdminI18n } from '../i18n'

const { t } = useAdminI18n()

const { to } = useAtelierAdmin()
const { items } = useAtelierNavigation()
const { user } = useAtelierSession()
const { schema } = useAtelierAdminSchema()
const { dashboard, retry } = useAtelierDashboard()
const toast = useAdminToast()

const typeLabel = (name: string) => schema.value?.collections.find(c => c.name === name)?.labels?.plural
  ?? schema.value?.singletons.find(s => s.name === name)?.label ?? humanize(name)
const entryTitle = (type: string, data: Record<string, unknown>) => {
  const key = titleField(schema.value?.collections.find(c => c.name === type))
  return String((key && data[key]) || t('common.untitled'))
}
const when = (iso: string) => new Date(iso).toLocaleString()
const link = (type: string, id: string, singleton = false) => singleton ? to('singletons', type) : to('collections', type, id)
const failed = computed(() => dashboard.value?.failedJobs ?? [])

async function retryJob(id: string) {
  try {
    await retry.mutateAsync(id)
    toast.add({ color: 'success', title: t('home.queuedAgain') })
  }
  catch (e) {
    toast.add({ color: 'error', title: t('home.notRetried'), description: (e as AdminApiError).message })
  }
}
</script>

<template>
  <Page
    :title="t('nav.dashboard')"
    :description="t('home.signedInAs', { name: user?.name || user?.email })"
  >
    <CnAlert
      v-if="dashboard?.pendingMigrations"
      variant="warning"
      :title="t('home.migrationsTitle')"
      data-widget="migrations"
    >
      {{ t('home.migrations', { count: dashboard.pendingMigrations }) }}
    </CnAlert>

    <section
      v-if="failed.length"
      class="app-section"
      data-widget="failed-jobs"
    >
      <h2 class="app-section__title">
        <Icon name="triangle-alert" /> {{ t('home.failedJobs') }}
      </h2>
      <div class="app-table-wrap">
        <table class="cn-table">
          <caption class="sr-only">
            {{ t('home.failedJobs') }}
          </caption>
          <thead>
            <tr>
              <th scope="col">
                {{ t('home.job') }}
              </th>
              <th scope="col">
                {{ t('home.error') }}
              </th>
              <th scope="col">
                {{ t('home.lastTried') }}
              </th>
              <th scope="col">
                <span class="sr-only">{{ t('common.actions') }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="job in failed"
              :key="job.id"
            >
              <td><code>{{ job.name }}</code></td>
              <td>{{ job.lastError ?? '—' }}</td>
              <td>{{ when(job.runAt) }} ({{ t('home.tries', { count: job.attempts }) }})</td>
              <td class="app-actions-cell">
                <CnButton
                  size="sm"
                  variant="secondary"
                  :aria-label="t('home.retryJob', { name: job.name })"
                  @click="retryJob(job.id)"
                >
                  {{ t('home.retry') }}
                </CnButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <div class="app-widgets">
      <section
        class="app-section cn-card cn-card--raised cn-card--size-md"
        data-widget="drafts"
      >
        <h2 class="app-section__title">
          {{ t('home.drafts') }}
        </h2>
        <ul
          v-if="dashboard?.drafts.length"
          class="app-list"
        >
          <li
            v-for="d in dashboard.drafts"
            :key="`${d.type}/${d.id}`"
          >
            <NuxtLink :to="link(d.type, d.id)">
              {{ entryTitle(d.type, d.data) }}
            </NuxtLink>
            <span class="app-muted"> · {{ typeLabel(d.type) }} · {{ when(d.updatedAt) }}</span>
            <CnBadge
              v-if="d.publishedVersion !== null"
              variant="warning"
              size="sm"
            >
              {{ t('status.changed') }}
            </CnBadge>
          </li>
        </ul>
        <p
          v-else
          class="app-muted"
        >
          {{ t('home.noDrafts') }}
        </p>
      </section>

      <section
        class="app-section cn-card cn-card--raised cn-card--size-md"
        data-widget="scheduled"
      >
        <h2 class="app-section__title">
          {{ t('home.scheduled') }}
        </h2>
        <ul
          v-if="dashboard?.scheduled.length"
          class="app-list"
        >
          <li
            v-for="s in dashboard.scheduled"
            :key="`${s.type}/${s.id}/${s.action}`"
          >
            <CnBadge
              :variant="s.action === 'publish' ? 'success' : 'neutral'"
              size="sm"
            >
              {{ s.action === 'publish' ? t('list.publish') : t('list.unpublish') }}
            </CnBadge>
            <NuxtLink :to="link(s.type, s.id, s.singleton)">
              {{ typeLabel(s.type) }}{{ s.singleton ? '' : ` · ${s.id}` }}
            </NuxtLink>
            <span class="app-muted"> · {{ when(s.runAt) }}</span>
          </li>
        </ul>
        <p
          v-else
          class="app-muted"
        >
          {{ t('home.nothingScheduled') }}
        </p>
      </section>

      <section
        v-if="dashboard?.activity"
        class="app-section cn-card cn-card--raised cn-card--size-md"
        data-widget="activity"
      >
        <h2 class="app-section__title">
          {{ t('home.activity') }}
        </h2>
        <ul
          v-if="dashboard.activity.length"
          class="app-list"
        >
          <li
            v-for="a in dashboard.activity"
            :key="a.id"
          >
            <code>{{ a.action }}</code>
            <span v-if="a.target"> · {{ a.target.type }}</span>
            <span class="app-muted"> · {{ when(a.at) }}</span>
          </li>
        </ul>
        <p
          v-else
          class="app-muted"
        >
          {{ t('home.noActivity') }}
        </p>
      </section>
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
          <Icon :name="item.icon" />
          {{ item.label }}
        </NuxtLink>
      </li>
    </ul>
  </Page>
</template>
