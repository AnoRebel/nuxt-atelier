import { type Ref, nextTick, onScopeDispose, watch } from "vue";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Traps focus inside `el` while `active`, closes on Escape, restores focus on
 * deactivate. Mirrors the React useFocusTrap.
 *
 * For non-modal surfaces that cannot be a native `<dialog>`. Modal, Dialog,
 * and Drawer use `useModalDialog`.
 */
export function useFocusTrap(el: Ref<HTMLElement | null>, active: Ref<boolean>, onClose: () => void): void {
  let previouslyFocused: HTMLElement | null = null;
  let trapped: HTMLElement | null = null;

  function focusables(node: HTMLElement): HTMLElement[] {
    return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
  }

  function onKey(e: KeyboardEvent) {
    // A nested surface already handled this key.
    if (e.defaultPrevented || !trapped) return;
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const items = focusables(trapped);
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && ((document.activeElement?.shadowRoot?.activeElement ?? document.activeElement) === first || (document.activeElement?.shadowRoot?.activeElement ?? document.activeElement) === trapped)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (document.activeElement?.shadowRoot?.activeElement ?? document.activeElement) === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function release() {
    if (!trapped) return;
    trapped.removeEventListener("keydown", onKey);
    trapped = null;
    previouslyFocused?.focus?.();
  }

  watch(
    active,
    async (isActive) => {
      // `immediate` runs during setup, which includes SSR.
      if (typeof document === "undefined") return;
      if (!isActive) return release();
      previouslyFocused = (document.activeElement?.shadowRoot?.activeElement ?? document.activeElement) as HTMLElement | null;
      await nextTick();
      const node = el.value;
      if (!node || !active.value) return;
      trapped = node;
      // Listen on the trapped node so Escape is scoped to the focused surface.
      node.addEventListener("keydown", onKey);
      if (!node.hasAttribute("tabindex")) node.setAttribute("tabindex", "-1");
      (focusables(node)[0] ?? node).focus();
    },
    { immediate: true },
  );

  // Unmounting while active must not leave a listener behind.
  onScopeDispose(release);
}
