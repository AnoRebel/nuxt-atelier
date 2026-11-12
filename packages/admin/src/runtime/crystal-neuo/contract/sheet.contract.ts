import { defineContract } from "./types";

export const sheetContract = defineContract({
  name: "sheet",
  description: "Modal panel that rises from the bottom edge; the mobile counterpart of a dialog.",
  variants: ["default"],
  defaultVariant: "default",
  sizes: ["md"],
  defaultSize: "md",
  states: ["default"],
  aria: "dialog",
  ariaNotes: [
    "A native <dialog> opened with showModal(): the page behind is inert.",
    "Labelled by its title via aria-labelledby; focus returns to the trigger on close.",
    "Respects the bottom safe-area inset.",
  ],
  keyboard: [
    { key: "Escape", action: "Close" },
    { key: "Tab", action: "Move focus within the sheet" },
  ],
  rtl: "logical-properties",
  model: { prop: "open", type: "boolean" },
  touchTarget: true,
});

export type SheetVariant = (typeof sheetContract.variants)[number];
export type SheetSize = (typeof sheetContract.sizes)[number];
