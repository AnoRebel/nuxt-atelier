import { defineContract } from "./types";

export const tabsContract = defineContract({
  name: "tabs",
  description: "Tabbed panels following the WAI-ARIA Tabs pattern.",
  variants: ["line", "enclosed"],
  defaultVariant: "line",
  sizes: ["sm", "md"],
  defaultSize: "md",
  states: ["default", "hover", "focus-visible", "selected", "disabled"],
  aria: "tablist",
  ariaNotes: [
    'role="tablist" wraps role="tab" buttons; each tab controls a role="tabpanel".',
    'Selected tab has aria-selected="true" and tabindex=0; others tabindex=-1.',
  ],
  keyboard: [
    { key: "ArrowRight", action: "Focus & select next tab (wraps)" },
    { key: "ArrowLeft", action: "Focus & select previous tab (wraps)" },
    { key: "Home", action: "Focus first tab" },
    { key: "End", action: "Focus last tab" },
    { key: "Enter", action: "Activate focused tab" },
    { key: "Space", action: "Activate focused tab" },
  ],
  rtl: "mirrored",
  model: { prop: "value", type: "string" },
  touchTarget: true,
});

export type TabsVariant = (typeof tabsContract.variants)[number];
export type TabsSize = (typeof tabsContract.sizes)[number];
