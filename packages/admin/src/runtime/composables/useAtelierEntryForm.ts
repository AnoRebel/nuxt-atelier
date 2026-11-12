// Editing one entry, or a singleton: it loads the draft, validates with the same rules as the server (the
// type's field definitions), saves with the version it read (409 when someone saved in between), and puts the
// server's validation errors on their fields. The form is TanStack Form's, so any kit can bind its fields.
import type { MaybeRefOrGetter } from 'vue'
import type { AdminApiError, Entry } from '../types'
import { useForm } from '@tanstack/vue-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, onScopeDispose, ref, toValue, watch } from 'vue'
import { defaultsFactory, validateEntry } from '#atelier/shared/fields'
import { atelierFetch } from './useAtelierAdmin'
import { useAtelierAdminSchema } from './useAtelierAdminSchema'

export interface EntryFormTarget {
  kind: 'collection' | 'singleton'
  name: string
  /** A collection entry's id; none for a new entry. */
  id?: string
}

type Saved = Entry & { version: number }

/** A plain copy of entry data (query results are reactive proxies, which structuredClone refuses). */
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export function useAtelierEntryForm(target: MaybeRefOrGetter<EntryFormTarget>) {
  const client = useQueryClient()
  const { schema } = useAtelierAdminSchema()
  const t = computed(() => toValue(target))
  const type = computed(() => t.value.kind === 'collection'
    ? schema.value?.collections.find(c => c.name === t.value.name)
    : schema.value?.singletons.find(s => s.name === t.value.name))
  const base = computed(() => t.value.kind === 'collection' ? `/collections/${encodeURIComponent(t.value.name)}` : `/singletons/${encodeURIComponent(t.value.name)}`)
  const url = computed(() => t.value.kind === 'collection' && t.value.id ? `${base.value}/${encodeURIComponent(t.value.id)}` : base.value)
  const isNew = computed(() => t.value.kind === 'collection' && !t.value.id)

  const entry = useQuery({
    queryKey: ['atelier', computed(() => `${t.value.kind}s`), computed(() => t.value.name), 'entry', computed(() => t.value.id ?? '')],
    queryFn: () => atelierFetch<Saved>(url.value, { query: { draft: 'true' } }),
    enabled: computed(() => !!type.value && !isNew.value),
  })
  const version = computed<number | null>(() => entry.data.value?.version ?? null)

  const form = useForm({
    defaultValues: {} as Record<string, unknown>,
    // validation runs again on every submit (see submit()): a failed one mustn't block the next
    canSubmitWhenInvalid: true,
    validators: {
      // the server validates too (and checks uniqueness); this only saves a round trip
      onSubmitAsync: async ({ value }) => {
        const fields = type.value?.fields ?? {}
        const result = await validateEntry(fields, value, { isUnique: async () => true, blocks: schema.value?.blocks as never })
        return result.success ? undefined : { fields: Object.fromEntries(result.errors.map(e => [e.path, e.message])) }
      },
    },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(value)
    },
  })

  // fill the form when the entry (or a new entry's defaults) arrives, unless the user already typed
  watch([type, () => entry.data.value], ([fieldsOf, loaded]) => {
    if (!fieldsOf || form.state.isDirty)
      return
    if (isNew.value)
      form.reset(defaultsFactory(fieldsOf.fields)())
    else if (loaded)
      form.reset(copy(loaded.data))
  }, { immediate: true })

  // Local recovery: unsaved changes are copied to this browser's storage as they're made, so a crash or a
  // closed tab doesn't lose them; reopening the entry offers them back. Saving or discarding removes the copy.
  const recoveryKey = computed(() => `atelier-admin-recovery:${t.value.kind}:${t.value.name}:${t.value.id ?? 'new'}`)
  const storage = () => {
    try {
      return globalThis.localStorage
    }
    catch {
      return undefined // storage blocked: no recovery copies
    }
  }
  const recovery = ref<{ values: Record<string, unknown>, savedAt: string } | null>(null)
  const values = form.useStore(state => state.values)
  const dirty = form.useStore(state => state.isDirty)
  // offered once the entry has loaded, when the copy differs from what was saved
  watch(() => [type.value, entry.data.value, isNew.value] as const, ([fieldsOf, loaded, fresh]) => {
    if (!fieldsOf || (!loaded && !fresh) || recovery.value)
      return
    const raw = storage()?.getItem(recoveryKey.value)
    const copyOf = raw ? JSON.parse(raw) as { values: Record<string, unknown>, savedAt: string } : null
    if (copyOf && JSON.stringify(copyOf.values) !== JSON.stringify(loaded?.data ?? defaultsFactory(fieldsOf.fields)()))
      recovery.value = copyOf
  }, { immediate: true })
  let timer: ReturnType<typeof setTimeout> | undefined
  watch(values, (current) => {
    if (!dirty.value)
      return
    clearTimeout(timer)
    timer = setTimeout(() => storage()?.setItem(recoveryKey.value, JSON.stringify({ values: current, savedAt: new Date().toISOString() })), 400)
  }, { deep: true })
  onScopeDispose(() => clearTimeout(timer))
  const forgetRecovery = () => {
    clearTimeout(timer)
    storage()?.removeItem(recoveryKey.value)
    recovery.value = null
  }
  /** Puts the recovered changes in the form (unsaved, until the user saves). */
  function restoreRecovery() {
    const copyOf = recovery.value
    if (!copyOf)
      return
    for (const [key, value] of Object.entries(copyOf.values))
      form.setFieldValue(key as never, value as never)
    recovery.value = null
  }

  const invalidate = () => client.invalidateQueries({ queryKey: ['atelier', `${t.value.kind}s`, t.value.name] })
  const serverErrors = (error: AdminApiError) => {
    for (const { path, message } of error.errors ?? [])
      form.setFieldMeta(path as never, meta => ({ ...meta, errorMap: { ...meta?.errorMap, onServer: message } }) as never)
  }

  const save = useMutation({
    mutationFn: (data: Record<string, unknown>) => isNew.value
      ? atelierFetch<Saved>(base.value, { method: 'POST', body: { data } })
      : atelierFetch<Saved>(url.value, { method: 'PATCH', body: { version: version.value, data } }),
    onSuccess: async (saved) => {
      forgetRecovery()
      client.setQueryData(['atelier', `${t.value.kind}s`, t.value.name, 'entry', saved.id && t.value.kind === 'collection' ? saved.id : ''], saved)
      form.reset(copy(saved.data))
      await invalidate()
    },
    onError: serverErrors,
  })
  const publish = useMutation({
    mutationFn: () => atelierFetch<Saved>(`${url.value}/publish`, { method: 'POST', body: { version: version.value } }),
    onSuccess: invalidate,
  })
  const unpublish = useMutation({ mutationFn: () => atelierFetch<Saved>(`${url.value}/unpublish`, { method: 'POST' }), onSuccess: invalidate })
  const remove = useMutation({ mutationFn: () => atelierFetch(url.value, { method: 'DELETE' }), onSuccess: () => (forgetRecovery(), invalidate()) })

  /**
   * Validates and saves. Errors from the previous submit and from the server are cleared first, so fields a
   * kit doesn't bind (or binds without validators) don't keep stale ones.
   */
  async function submit() {
    for (const key of Object.keys(form.state.fieldMeta))
      form.setFieldMeta(key as never, meta => ({ ...meta, errorMap: { ...meta?.errorMap, onSubmit: undefined, onServer: undefined } }) as never)
    await form.handleSubmit()
  }

  return {
    type,
    form,
    submit,
    entry: computed(() => entry.data.value),
    isNew,
    loading: computed(() => !isNew.value && entry.isPending.value),
    loadError: computed(() => entry.error.value as AdminApiError | null),
    /** Whether the form has changes not saved yet. */
    dirty,
    /** Unsaved changes found in this browser from an earlier visit, offered back (see restoreRecovery). */
    recovery,
    restoreRecovery,
    /** Drops the recovery copy (and the offer). */
    discardRecovery: forgetRecovery,
    /** Saved changes the site doesn't show yet. */
    unpublished: computed(() => !!entry.data.value && entry.data.value.publishedVersion !== entry.data.value.version),
    save,
    publish,
    unpublish,
    remove,
  }
}
