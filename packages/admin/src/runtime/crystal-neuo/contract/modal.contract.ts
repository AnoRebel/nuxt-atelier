import { defineContract } from "./types";

export const modalContract = defineContract({
  name: "modal",
  description: "Centered overlay surface over a scrim. Spotlight focus, never blindness.",
  variants: ["default"],
  defaultVariant: "default",
  sizes: ["sm", "md", "lg"],
  defaultSize: "md",
  states: ["default"],
  aria: "dialog",
  ariaNotes: [
    'role="dialog" aria-modal="true"; labelled by its title via aria-labelledby.',
    "Focus is trapped while open and restored to the trigger on close.",
    "Background content is inert (inert attribute) while open.",
  ],
  keyboard: [
    { key: "Escape", action: "Close" },
    { key: "Tab", action: "Cycle focus within the dialog (trapped)" },
    { key: "Shift+Tab", action: "Cycle focus backward (trapped)" },
  ],
  rtl: "logical-properties",
  model: { prop: "open", type: "boolean" },
  touchTarget: true,
});

export type ModalVariant = (typeof modalContract.variants)[number];
export type ModalSize = (typeof modalContract.sizes)[number];
