<!-- Search engines: robots.txt rules, for roles with the `settings` capability. Saved here, they override
     the site's configuration; "Use the configuration" goes back to it. -->
<script setup lang="ts">
import type { AdminApiError } from '../types'
import { computed, ref, watch } from 'vue'
import { useAtelierAdmin } from '../composables/useAtelierAdmin'
import { useAtelierPermissions } from '../composables/useAtelierPermissions'
import { useAtelierSetting } from '../composables/useAtelierSetting'
import CnAlert from '../crystal-neuo/components/Alert.vue'
import CnButton from '../crystal-neuo/components/Button.vue'
import CnTextarea from '../crystal-neuo/components/Textarea.vue'
import CnToggle from '../crystal-neuo/components/Toggle.vue'
import { useAdminI18n } from '../i18n'
import { useAdminToast } from '../toast'
import Icon from './Icon'
import NotFound from './NotFound.vue'
import Page from './Page.vue'

interface Rule { userAgent: string[], allow: string[], disallow: string[] }
interface Robots { indexable: boolean, rules: Rule[] }

const { t } = useAdminI18n()
const { base } = useAtelierAdmin()
const { manages } = useAtelierPermissions()
const { setting, save, reset } = useAtelierSetting<Robots>('robots')
const toast = useAdminToast()
const error = ref('')

// edited as text: one entry per line
const lines = (list: string[]) => list.join('\n')
const list = (text: string) => text.split('\n').map(l => l.trim()).filter(Boolean)
const indexable = ref(true)
const rules = ref<{ userAgent: string, allow: string, disallow: string }[]>([])
watch(setting, (s) => {
  if (!s)
    return
  indexable.value = s.value.indexable
  rules.value = s.value.rules.map(r => ({ userAgent: lines(r.userAgent), allow: lines(r.allow), disallow: lines(r.disallow) }))
}, { immediate: true })

const value = computed<Robots>(() => ({
  indexable: indexable.value,
  rules: rules.value.map(r => ({ userAgent: list(r.userAgent), allow: list(r.allow), disallow: list(r.disallow) })).filter(r => r.userAgent.length),
}))
// what crawlers will read: the always-kept-out paths first, as the server writes them
const preview = computed(() => [{ userAgent: ['*'], allow: [], disallow: [] }, ...value.value.rules]
  .reduce<Rule[]>((groups, r) => {
    const same = groups.find(g => g.userAgent.toSorted().join() === r.userAgent.toSorted().join())
    if (same) {
      same.allow.push(...r.allow)
      same.disallow.push(...r.disallow)
    }
    else {
      groups.push({ userAgent: [...r.userAgent], allow: [...r.allow], disallow: [...r.disallow] })
    }
    return groups
  }, [])
  .map(g => [
    ...g.userAgent.map(ua => `User-agent: ${ua}`),
    ...value.value.indexable ? [...new Set(g.allow)].map(p => `Allow: ${p}`) : [],
    ...(value.value.indexable ? [...new Set([base, '/api/_atelier/', ...g.disallow])] : ['/']).map(p => `Disallow: ${p}`),
  ].join('\n'))
  .join('\n\n'))

async function submit() {
  error.value = ''
  try {
    await save.mutateAsync(value.value)
    toast.add({ color: 'success', title: t('robots.saved') })
  }
  catch (e) {
    error.value = (e as AdminApiError).errors?.map(x => `${x.path}: ${x.message}`).join('. ') || (e as AdminApiError).message
  }
}
</script>

<template>
  <NotFound
    v-if="!manages('settings')"
    forbidden
  />
  <Page
    v-else
    :title="t('robots.title')"
    icon="search"
    :description="t('robots.description')"
  >
    <p
      v-if="setting"
      class="app-muted"
      data-robots-source
    >
      {{ t(`robots.source.${setting.source}`) }}
    </p>
    <form
      class="app-form"
      @submit.prevent="submit"
    >
      <CnToggle
        v-model:checked="indexable"
        :label="t('robots.indexable')"
      />
      <p
        v-if="!indexable"
        class="app-muted"
      >
        {{ t('robots.notIndexable') }}
      </p>
      <fieldset
        v-for="(rule, i) in rules"
        :key="i"
        class="app-fieldset"
      >
        <legend class="cn-label">
          {{ t('robots.rules') }} {{ i + 1 }}
        </legend>
        <CnTextarea
          v-model="rule.userAgent"
          :label="t('robots.userAgent')"
          :hint="t('robots.userAgentHint')"
          :rows="2"
        />
        <CnTextarea
          v-model="rule.disallow"
          :label="t('robots.disallow')"
          :hint="t('robots.pathsHint')"
          :rows="3"
        />
        <CnTextarea
          v-model="rule.allow"
          :label="t('robots.allow')"
          :hint="t('robots.pathsHint')"
          :rows="2"
        />
        <div>
          <CnButton
            variant="ghost"
            size="sm"
            @click="rules.splice(i, 1)"
          >
            <Icon name="trash-2" />
            {{ t('robots.removeRule') }}
          </CnButton>
        </div>
      </fieldset>
      <div>
        <CnButton
          variant="secondary"
          size="sm"
          @click="rules.push({ userAgent: '*', allow: '', disallow: '' })"
        >
          <Icon name="plus" />
          {{ t('robots.addRule') }}
        </CnButton>
      </div>
      <section class="app-section">
        <h2 class="app-section__title">
          {{ t('robots.preview') }}
        </h2>
        <pre
          class="app-mono"
          data-robots-preview
        >{{ preview }}</pre>
      </section>
      <CnAlert
        v-if="error"
        variant="danger"
        live
      >
        {{ error }}
      </CnAlert>
      <div class="app-form__actions">
        <CnButton
          v-if="setting?.source === 'database'"
          variant="ghost"
          :loading="reset.isPending.value"
          @click="reset.mutate()"
        >
          {{ t('robots.reset') }}
        </CnButton>
        <CnButton
          type="submit"
          :loading="save.isPending.value"
        >
          {{ t('common.save') }}
        </CnButton>
      </div>
    </form>
  </Page>
</template>
