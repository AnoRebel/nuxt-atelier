import { computed, useAttrs } from "vue";

/**
 * Splits fallthrough attributes for a field component: `class` and `style`
 * stay on the wrapper, everything else (`name`, `required`, `autocomplete`,
 * listeners, …) goes to the native control so forms and validation work.
 * Pair with `defineOptions({ inheritAttrs: false })`.
 */
export function useControlAttrs() {
  const attrs = useAttrs();
  return {
    rootAttrs: computed(() => ({ class: attrs.class, style: attrs.style })),
    controlAttrs: computed(() => {
      const { class: _class, style: _style, ...rest } = attrs;
      return rest;
    }),
  };
}
