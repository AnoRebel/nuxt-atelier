// Light or dark, as the visitor chose it (a cookie, so the server renders it: no flash), else as their
// system is (CSS alone, see main.css).
export function useColorScheme() {
  const choice = useCookie<'light' | 'dark' | null>('color-scheme', { default: () => null, maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  useHead({ htmlAttrs: { class: computed(() => choice.value ?? '') } })
  /** Dark now: the choice, or (with none, in the browser) the system's. */
  const isDark = computed(() => choice.value ? choice.value === 'dark' : import.meta.client && matchMedia('(prefers-color-scheme: dark)').matches)
  const toggle = () => choice.value = isDark.value ? 'light' : 'dark'
  return { choice, isDark, toggle }
}
