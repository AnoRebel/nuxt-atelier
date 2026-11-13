// The admin's interface language, apart from the content's locales: English ships with the kit; the app and
// plugins add languages (module option `languages`, hook `atelier:admin:languages`), loaded when chosen.
// Each viewer picks theirs (remembered in this browser), else the app's default (app config
// `atelierAdmin.language`), else the browser's language when installed, else English. A key missing from a
// language shows in English.
import { computed, ref } from 'vue'
import languages from '#atelier-admin-languages'
import en from './en'

type Messages = Record<string, string>
const STORAGE = 'atelier-admin-language'

const loaded = ref<Record<string, Messages>>({ en })
const done = new Set<string>()
const current = ref('en')

const stored = () => {
  try {
    return localStorage.getItem(STORAGE)
  }
  catch {
    return null // storage blocked: the default for this visit
  }
}

/** Every installed language: its code and its own name. */
const installed = computed(() => [{ code: 'en', name: languages.find(l => l.code === 'en')?.name ?? 'English' }, ...languages.filter(l => l.code !== 'en').map(({ code, name }) => ({ code, name }))])

// a language's messages, merged; the app's `en` messages add to or change the kit's English
async function load(code: string) {
  const language = languages.find(l => l.code === code)
  if (!language || done.has(code))
    return
  done.add(code)
  const parts = await Promise.all(language.messages.map(m => m()))
  loaded.value = { ...loaded.value, [code]: Object.assign({}, code === 'en' ? en : {}, ...parts.map(p => p.default)) }
}

/** Switches the admin's language (and remembers it, unless `remember` is false). */
async function setLanguage(code: string, remember = true) {
  if (!installed.value.some(l => l.code === code))
    return
  await load(code)
  current.value = code
  if (remember) {
    try {
      localStorage.setItem(STORAGE, code)
    }
    catch {
      // storage blocked: this visit only
    }
  }
}

/** The language to start with: the viewer's choice, the app's default, the browser's, English. */
export async function startLanguage(appDefault?: string) {
  const codes = installed.value.map(l => l.code)
  const browser = (globalThis.navigator?.languages ?? []).map(l => l.toLowerCase()).flatMap(l => [l, l.split('-')[0]!])
  const code = [stored(), appDefault, ...browser].find((c): c is string => !!c && codes.includes(c)) ?? 'en'
  await load('en')
  await setLanguage(code, false)
}

/** `{name}` placeholders filled from `params`. */
const fill = (text: string, params?: Record<string, unknown>) =>
  params ? text.replace(/\{(\w+)\}/g, (all, key: string) => key in params ? String(params[key]) : all) : text

export function useAdminI18n() {
  return {
    /** The interface text for `key`, in the admin's language (English when it lacks one). */
    t: (key: string, params?: Record<string, unknown>) => fill(loaded.value[current.value]?.[key] ?? loaded.value.en?.[key] ?? key, params),
    language: computed(() => current.value),
    languages: installed,
    setLanguage,
  }
}
