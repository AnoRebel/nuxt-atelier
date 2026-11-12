import { defineContract } from "./types";

export const toastContract = defineContract({
  name: "toast",
  description: "Transient notification that auto-dismisses. Neutral or semantic.",
  variants: ["neutral", "success", "warning", "danger"],
  defaultVariant: "neutral",
  sizes: ["md"],
  defaultSize: "md",
  states: ["default"],
  aria: "status",
  ariaNotes: [
    'Lives in a role="status" (polite) region; danger toasts use role="alert" (assertive).',
    "Auto-dismiss timer pauses on hover/focus; a close button is always present.",
  ],
  keyboard: [{ key: "Escape", action: "Dismiss the focused toast" }],
  rtl: "logical-properties",
  touchTarget: true,
});

export type ToastVariant = (typeof toastContract.variants)[number];
export type ToastSize = (typeof toastContract.sizes)[number];
