import { defineContract } from "./types";

export const dialogContract = defineContract({
  name: "dialog",
  description: "Confirmation/decision dialog requiring a response. Like Modal but action-oriented.",
  variants: ["default", "destructive"],
  defaultVariant: "default",
  sizes: ["sm", "md"],
  defaultSize: "sm",
  states: ["default"],
  aria: "alertdialog",
  ariaNotes: [
    'role="alertdialog" aria-modal="true"; labelled by title, described by body.',
    "Focus moves to the least-destructive action on open; trapped while open; restored on close.",
  ],
  keyboard: [
    { key: "Escape", action: "Cancel/close" },
    { key: "Tab", action: "Cycle focus (trapped)" },
    { key: "Enter", action: "Confirm the focused action" },
  ],
  rtl: "logical-properties",
  model: { prop: "open", type: "boolean" },
  touchTarget: true,
});

export type DialogVariant = (typeof dialogContract.variants)[number];
export type DialogSize = (typeof dialogContract.sizes)[number];
