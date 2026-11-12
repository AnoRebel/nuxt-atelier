import { defineContract } from "./types";

export const menuContract = defineContract({
  name: "menu",
  description: "A list of actions opened from a trigger button and anchored to it.",
  variants: ["default"],
  defaultVariant: "default",
  sizes: ["md"],
  defaultSize: "md",
  states: ["default", "hover", "focus-visible", "disabled"],
  aria: "menu",
  ariaNotes: [
    'Trigger is a button with aria-haspopup="menu", aria-expanded, and aria-controls.',
    'The menu uses role="menu" and the Popover API (light dismiss); items use role="menuitem".',
    "Anchored to the trigger with CSS anchor positioning; positioned from coordinates where unsupported.",
    "Focus returns to the trigger when the menu closes.",
  ],
  keyboard: [
    { key: "Enter / Space / ArrowDown", action: "Open and focus the first item" },
    { key: "ArrowUp (on trigger)", action: "Open and focus the last item" },
    { key: "ArrowDown / ArrowUp", action: "Move between items" },
    { key: "Home / End", action: "First / last item" },
    { key: "Character", action: "Move to the next item starting with it" },
    { key: "Enter / Space", action: "Activate the item and close" },
    { key: "Escape / Tab", action: "Close" },
  ],
  rtl: "logical-properties",
  model: { prop: "open", type: "boolean" },
  touchTarget: true,
});

export type MenuVariant = (typeof menuContract.variants)[number];
export type MenuSize = (typeof menuContract.sizes)[number];

/** One entry in a menu: an action, or a separator between groups. */
export type MenuEntry =
  { label: string; onSelect?: () => void; disabled?: boolean; danger?: boolean } | { separator: true };

/**
 * The item index a key moves focus to, or null when the key does not navigate.
 * Arrow keys wrap, Home/End jump, and a printable character moves to the next
 * item whose label starts with it. Disabled items and separators are skipped.
 * Shared so both adapters navigate identically.
 */
export function menuNavigation(items: readonly MenuEntry[], current: number, key: string): number | null {
  const enabled = items
    .map((it, i) => ({ it, i }))
    .filter(({ it }) => !("separator" in it) && !it.disabled)
    .map(({ i }) => i);
  if (enabled.length === 0) return null;
  const pos = enabled.indexOf(current);
  if (key === "ArrowDown") return enabled[(pos + 1) % enabled.length]!;
  if (key === "ArrowUp") return enabled[(pos - 1 + enabled.length) % enabled.length]!;
  if (key === "Home") return enabled[0]!;
  if (key === "End") return enabled[enabled.length - 1]!;
  if (key.length === 1 && key.trim() !== "") {
    const ch = key.toLowerCase();
    const order = [...enabled.slice(pos + 1), ...enabled.slice(0, pos + 1)];
    const hit = order.find((i) => {
      const it = items[i]!;
      return !("separator" in it) && it.label.toLowerCase().startsWith(ch);
    });
    return hit ?? null;
  }
  return null;
}

/** Whether the browser supports CSS anchor positioning. */
export function supportsAnchorPositioning(): boolean {
  return typeof CSS !== "undefined" && CSS.supports("anchor-name: --a");
}
