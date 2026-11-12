import { defineContract } from "./types";

export const tableContract = defineContract({
  name: "table",
  description: "Tabular data with optional zebra striping and a sticky header.",
  variants: ["default", "striped"],
  defaultVariant: "default",
  sizes: ["sm", "md"],
  defaultSize: "md",
  states: ["default", "hover", "selected"],
  aria: "table",
  ariaNotes: [
    "Renders a semantic <table> with <thead>/<tbody> and <th scope>.",
    "Sortable columns expose aria-sort on the active header.",
  ],
  keyboard: [],
  rtl: "logical-properties",
  touchTarget: false,
});

export type TableVariant = (typeof tableContract.variants)[number];
export type TableSize = (typeof tableContract.sizes)[number];
