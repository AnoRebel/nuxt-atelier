import { defineContract } from "./types";

export const listContract = defineContract({
  name: "list",
  description: "Vertical list of items, optionally interactive (selectable rows).",
  variants: ["plain", "bordered"],
  defaultVariant: "plain",
  sizes: ["sm", "md"],
  defaultSize: "md",
  states: ["default", "hover", "focus-visible", "selected"],
  aria: "list",
  ariaNotes: [
    'Renders a semantic <ul>/<li>; interactive lists use role="listbox"/"option".',
    'Selected option carries aria-selected="true".',
  ],
  keyboard: [
    { key: "ArrowDown", action: "Focus next item (interactive lists)" },
    { key: "ArrowUp", action: "Focus previous item (interactive lists)" },
  ],
  rtl: "logical-properties",
  touchTarget: true,
});

export type ListVariant = (typeof listContract.variants)[number];
export type ListSize = (typeof listContract.sizes)[number];
