import { defineContract } from "./types";

export const drawerContract = defineContract({
  name: "drawer",
  description: "Edge-anchored panel that slides in over a scrim. Placement is logical (start/end).",
  variants: ["default"],
  defaultVariant: "default",
  sizes: ["sm", "md", "lg"],
  defaultSize: "md",
  states: ["default"],
  aria: "dialog",
  ariaNotes: [
    'role="dialog" aria-modal="true"; labelled by its heading.',
    "Placement start/end resolves with text direction (start = left in LTR, right in RTL).",
    "Focus trapped while open; restored on close; background inert.",
  ],
  keyboard: [
    { key: "Escape", action: "Close" },
    { key: "Tab", action: "Cycle focus within the drawer (trapped)" },
  ],
  rtl: "mirrored",
  model: { prop: "open", type: "boolean" },
  touchTarget: true,
});

export type DrawerVariant = (typeof drawerContract.variants)[number];
export type DrawerSize = (typeof drawerContract.sizes)[number];
