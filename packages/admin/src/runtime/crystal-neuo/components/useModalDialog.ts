import { type Ref, nextTick, onBeforeUnmount, onMounted, watch } from "vue";

/**
 * The platform returns focus to the opener only if focus is still inside the
 * dialog when it closes. The slot content has already unmounted by then (focus
 * fell to <body>), so restore explicitly unless focus has moved on elsewhere.
 */
function restoreFocus(dialog: HTMLElement, opener: HTMLElement | null): void {
  const active = (document.activeElement?.shadowRoot?.activeElement ?? document.activeElement);
  const lost = !active || active === document.body || dialog.contains(active);
  if (lost && opener?.isConnected) opener.focus();
}

/**
 * Drives a native `<dialog>` as a modal overlay from a two-way `open` model.
 * Mirrors the React useModalDialog so Modal/Dialog/Drawer behave identically
 * across frameworks.
 *
 * `showModal()` makes the rest of the page inert, renders in the top layer
 * (no teleport needed), routes Escape to the topmost dialog only, and returns
 * focus to the opener on close.
 */
export function useModalDialog(el: Ref<HTMLDialogElement | null>, open: Ref<boolean>): void {
  let opener: HTMLElement | null = null;

  function sync() {
    const dialog = el.value;
    if (!dialog) return;
    if (open.value && !dialog.open) {
      opener = (document.activeElement?.shadowRoot?.activeElement ?? document.activeElement) as HTMLElement | null;
      dialog.showModal();
    } else if (!open.value && dialog.open) {
      dialog.close();
      restoreFocus(dialog, opener);
    }
  }

  // Escape fires `cancel`; keep the dialog open until the model says so.
  function onCancel(e: Event) {
    e.preventDefault();
    open.value = false;
  }
  // The browser may still close the dialog itself; keep the model in step.
  function onNativeClose() {
    if (open.value) open.value = false;
  }

  onMounted(() => {
    const dialog = el.value;
    if (!dialog) return;
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("close", onNativeClose);
    // Covers a dialog that mounts already open.
    sync();
  });
  // Wait for the slot content to render so showModal() can focus into it.
  watch(open, () => nextTick(sync));
  onBeforeUnmount(() => {
    const dialog = el.value;
    if (!dialog) return;
    dialog.removeEventListener("cancel", onCancel);
    dialog.removeEventListener("close", onNativeClose);
    if (dialog.open) dialog.close();
  });
}
