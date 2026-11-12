import { defineContract } from "./types";

export const paginationContract = defineContract({
  name: "pagination",
  description: "Page navigation control for paged data sets.",
  variants: ["default"],
  defaultVariant: "default",
  sizes: ["sm", "md"],
  defaultSize: "md",
  states: ["default", "hover", "focus-visible", "selected", "disabled"],
  aria: "navigation",
  ariaNotes: [
    '<nav aria-label="Pagination"> wrapping page links/buttons.',
    'Current page carries aria-current="page"; prev/next disabled at bounds.',
  ],
  keyboard: [{ key: "Tab", action: "Move between page controls" }],
  rtl: "mirrored",
  model: { prop: "page", type: "number" },
  touchTarget: true,
});

export type PaginationVariant = (typeof paginationContract.variants)[number];
export type PaginationSize = (typeof paginationContract.sizes)[number];

/** One slot in a pagination row: a page number, or a gap standing for skipped pages. */
export type PageSlot = number | "gap";

/**
 * The page slots to render for `page` of `pageCount`: always the first and last
 * page, `siblings` pages either side of the current one, and a gap wherever
 * pages are skipped. Shared so both adapters truncate identically.
 */
export function paginationRange(page: number, pageCount: number, siblings = 1): PageSlot[] {
  const count = Math.max(0, Math.floor(pageCount));
  // first + last + current + siblings + two gaps
  if (count <= siblings * 2 + 5) return Array.from({ length: count }, (_, i) => i + 1);
  const current = Math.min(Math.max(1, page), count);
  const start = Math.max(2, current - siblings);
  const end = Math.min(count - 1, current + siblings);
  const slots: PageSlot[] = [1];
  if (start > 2) slots.push("gap");
  for (let p = start; p <= end; p++) slots.push(p);
  if (end < count - 1) slots.push("gap");
  slots.push(count);
  return slots;
}
