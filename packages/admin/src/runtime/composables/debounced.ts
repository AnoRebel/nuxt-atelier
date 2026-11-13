import type { Ref } from 'vue'
import { onScopeDispose, ref, watch } from 'vue'

/** `source`'s value, `ms` after it last changed. */
export function refDebounced<T>(source: Ref<T>, ms: number): Ref<T> {
  const value = ref(source.value) as Ref<T>
  let timer: ReturnType<typeof setTimeout> | undefined
  watch(source, (next) => {
    clearTimeout(timer)
    timer = setTimeout(() => value.value = next, ms)
  })
  onScopeDispose(() => clearTimeout(timer))
  return value
}
