// AI assist in the admin (`#atelier-admin-ai`): actions that ask the server for a suggestion and show it
// for the editor to accept, edit or discard. Nothing is saved by them: an accepted suggestion goes into
// the form, which the editor saves as usual.
import type { Ref } from 'vue'
import { computed, ref } from 'vue'
import { useAtelierAdmin, useAtelierPermissions } from '#imports'
import AltText from './AiAltText.vue'
import Assistant from './AiAssistant.vue'
import Seo from './AiSeo.vue'
import TextActions from './AiTextActions.vue'

const set = ref(false)
let asked: Promise<void> | undefined

/** Whether AI actions show: the server has an adapter, and the user has the `ai` capability. */
function enabled(): Ref<boolean> {
  const { manages } = useAtelierPermissions()
  asked ??= useAtelierAdmin().api('/ai').then(() => void (set.value = true), () => void (asked = undefined))
  return computed(() => set.value && manages('ai'))
}

export const ai = { enabled, TextActions, AltText, Seo, Assistant }
