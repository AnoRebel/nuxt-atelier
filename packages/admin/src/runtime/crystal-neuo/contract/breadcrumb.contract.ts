import { defineContract } from "./types";

export const breadcrumbContract = defineContract({
  name: "breadcrumb",
  description: "Hierarchical navigation trail.",
  variants: ["default"],
  defaultVariant: "default",
  sizes: ["sm", "md"],
  defaultSize: "md",
  states: ["default", "hover", "focus-visible"],
  aria: "navigation",
  ariaNotes: [
    '<nav aria-label="Breadcrumb"> wrapping an ordered list of links.',
    'The current page is aria-current="page" and is not a link.',
    "Separators are decorative (aria-hidden).",
  ],
  keyboard: [{ key: "Tab", action: "Move between crumb links" }],
  rtl: "mirrored",
  touchTarget: true,
});

export type BreadcrumbVariant = (typeof breadcrumbContract.variants)[number];
export type BreadcrumbSize = (typeof breadcrumbContract.sizes)[number];
