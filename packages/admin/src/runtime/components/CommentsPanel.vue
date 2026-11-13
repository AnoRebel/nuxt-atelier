<!-- An entry's comment threads, on the entry or one of its blocks: reply, mention, resolve. Comments on a
     block that was removed stay, marked as such. -->
<script setup lang="ts">
import type { AdminApiError } from '../types'
import { computed, nextTick, reactive, ref } from 'vue'
import { useAtelierComments } from '../composables/useAtelierComments'
import { humanize } from '../composables/useAtelierNavigation'
import { useAtelierSession } from '../composables/useAtelierSession'
import CnBadge from '../crystal-neuo/components/Badge.vue'
import CnButton from '../crystal-neuo/components/Button.vue'
import CnSelect from '../crystal-neuo/components/Select.vue'
import CnTextarea from '../crystal-neuo/components/Textarea.vue'
import { useAdminToast } from '../toast'
import { useAdminI18n } from '../i18n'

const props = defineProps<{ type: string, id: string, data: Record<string, unknown>, canComment: boolean }>()
const { t } = useAdminI18n()
const toast = useAdminToast()
const { user } = useAtelierSession()
const comments = useAtelierComments(() => ({ type: props.type, id: props.id }))

/** The entry's blocks, in order, to comment on one. */
const blocks = computed(() => {
  const found: { value: string, label: string }[] = []
  const walk = (value: unknown) => {
    if (Array.isArray(value))
      return value.forEach(walk)
    if (!value || typeof value !== 'object')
      return
    const node = value as Record<string, unknown>
    if (typeof node.id === 'string' && typeof node.type === 'string')
      found.push({ value: node.id, label: t('comments.block', { name: `${humanize(node.type)} ${found.length + 1}` }) })
    Object.values(node).forEach(walk)
  }
  walk(props.data)
  return found
})
const blockLabel = (id: string | null) => blocks.value.find(b => b.value === id)?.label

// a draft per thread ('' for a new one)
const drafts = reactive<Record<string, { body: string, mentions: string[], block: string, pick: string }>>({})
const draft = (thread: string) => (drafts[thread] ??= { body: '', mentions: [], block: '', pick: '' })
const replying = ref<string | null>(null)
const mentionOptions = computed(() => [{ value: '', label: '—' }, ...comments.people.value.filter(p => p.id !== user.value?.id).map(p => ({ value: p.id, label: p.name }))])
function mention(thread: string, id: string) {
  const person = comments.people.value.find(p => p.id === id)
  const d = draft(thread)
  void nextTick(() => (d.pick = '')) // the picker goes back to empty, ready for the next one
  if (!person)
    return
  d.body = `${d.body}${d.body && !d.body.endsWith(' ') ? ' ' : ''}@${person.name} `
  if (!d.mentions.includes(id))
    d.mentions.push(id)
}
async function send(thread: string) {
  const d = draft(thread)
  if (!d.body.trim())
    return
  try {
    // only people still named in the text are mentioned
    const mentions = d.mentions.filter(id => d.body.includes(`@${comments.people.value.find(p => p.id === id)?.name}`))
    await comments.add.mutateAsync({ body: d.body, mentions, ...thread ? { thread } : { block: d.block || null } })
    drafts[thread] = { body: '', mentions: [], block: '', pick: '' }
    replying.value = null
  }
  catch (e) {
    toast.add({ color: 'error', title: t('comments.failed'), description: (e as AdminApiError).message })
  }
}
const when = (iso: string) => new Date(iso).toLocaleString()
</script>

<template>
  <section
    class="app-comments"
    aria-labelledby="atelier-comments-title"
    data-comments
  >
    <h2
      id="atelier-comments-title"
      class="app-section__title"
    >
      {{ t('comments.title') }}
    </h2>
    <p v-if="!comments.loading.value && !comments.threads.value.length">
      {{ t('comments.empty') }}
    </p>
    <ul class="app-comments__list">
      <li
        v-for="thread in comments.threads.value"
        :key="thread.id"
        class="app-comment cn-card cn-card--raised cn-card--size-sm"
        :data-resolved="thread.resolvedAt ? '' : undefined"
        :data-comment="thread.id"
      >
        <div class="app-comment__meta">
          <strong>{{ thread.authorName }}</strong>
          <time :datetime="thread.createdAt">{{ when(thread.createdAt) }}</time>
          <CnBadge
            v-if="thread.orphaned"
            size="sm"
            variant="warning"
            data-orphaned
          >
            {{ t('comments.removedBlock') }}
          </CnBadge>
          <CnBadge
            v-else-if="thread.block"
            size="sm"
          >
            {{ blockLabel(thread.block) }}
          </CnBadge>
          <CnBadge
            v-if="thread.resolvedAt"
            size="sm"
            variant="success"
          >
            {{ t('comments.resolved') }}
          </CnBadge>
        </div>
        <p class="app-comment__body">
          {{ thread.body }}
        </p>
        <ul
          v-if="thread.replies.length"
          class="app-comment__replies"
        >
          <li
            v-for="reply in thread.replies"
            :key="reply.id"
            class="app-comment"
          >
            <div class="app-comment__meta">
              <strong>{{ reply.authorName }}</strong>
              <time :datetime="reply.createdAt">{{ when(reply.createdAt) }}</time>
            </div>
            <p class="app-comment__body">
              {{ reply.body }}
            </p>
          </li>
        </ul>
        <div
          v-if="canComment"
          class="app-row"
        >
          <CnButton
            size="sm"
            variant="ghost"
            @click="replying = replying === thread.id ? null : thread.id"
          >
            {{ t('comments.reply') }}
          </CnButton>
          <CnButton
            size="sm"
            variant="ghost"
            :loading="comments.resolve.isPending.value"
            @click="comments.resolve.mutate({ id: thread.id, resolved: !thread.resolvedAt })"
          >
            {{ thread.resolvedAt ? t('comments.reopen') : t('comments.resolve') }}
          </CnButton>
          <CnButton
            v-if="thread.author === user?.id"
            size="sm"
            variant="ghost"
            @click="comments.remove.mutate(thread.id)"
          >
            {{ t('common.delete') }}
          </CnButton>
        </div>
        <form
          v-if="replying === thread.id"
          class="app-comment"
          @submit.prevent="send(thread.id)"
        >
          <CnTextarea
            v-model="draft(thread.id).body"
            :label="t('comments.reply')"
            :rows="2"
          />
          <div class="app-row">
            <CnSelect
              v-if="mentionOptions.length > 1"
              v-model="draft(thread.id).pick"
              :label="t('comments.mention')"
              :options="mentionOptions"
              @update:model-value="mention(thread.id, $event)"
            />
            <CnButton
              type="submit"
              size="sm"
              :loading="comments.add.isPending.value"
            >
              {{ t('comments.send') }}
            </CnButton>
          </div>
        </form>
      </li>
    </ul>
    <form
      v-if="canComment"
      class="app-comment"
      data-new-comment
      @submit.prevent="send('')"
    >
      <CnSelect
        v-if="blocks.length"
        v-model="draft('').block"
        :label="t('comments.about')"
        :options="[{ value: '', label: t('comments.wholeEntry') }, ...blocks]"
      />
      <CnTextarea
        v-model="draft('').body"
        :label="t('comments.new')"
        :rows="3"
      />
      <div class="app-row">
        <CnSelect
          v-if="mentionOptions.length > 1"
          v-model="draft('').pick"
          :label="t('comments.mention')"
          :options="mentionOptions"
          @update:model-value="mention('', $event)"
        />
        <CnButton
          type="submit"
          :loading="comments.add.isPending.value"
        >
          {{ t('comments.send') }}
        </CnButton>
      </div>
    </form>
  </section>
</template>
