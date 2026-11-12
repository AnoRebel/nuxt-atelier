// Crystal Neuo contract primitives. A contract is the single source of truth
// for a component's API surface — consumed by the React, Vue, and CSS adapters
// so the three implementations cannot drift.

/** A visual/interaction state every interactive component must style. */
export type ComponentState =
  | "default"
  | "hover"
  | "focus-visible"
  | "active"
  | "disabled"
  | "loading"
  | "error"
  | "selected"
  | "checked";

/** WAI-ARIA pattern a component follows (or "none" for non-interactive). */
export type AriaPattern =
  | "none"
  | "button"
  | "checkbox"
  | "radiogroup"
  | "switch"
  | "slider"
  | "tablist"
  | "dialog"
  | "alertdialog"
  | "alert"
  | "status"
  | "tooltip"
  | "listbox"
  | "combobox"
  | "menu"
  | "navigation"
  | "progressbar"
  | "table"
  | "list";

/** A single keyboard interaction: key -> what it does. */
export interface KeyBinding {
  key: string;
  action: string;
}

/**
 * The material a component renders in.
 *
 * Material is an axis, not a variant: it is universal (every component accepts
 * it), it is inherited through the DOM rather than defaulted per component, and
 * it changes expression only — never semantics or API. That is why it lives
 * here as a shared type instead of in each component's `variants`, and why the
 * adapters must emit `data-material` ONLY when a value is explicitly passed.
 * Emitting a default would pin the component and break inheritance.
 */
export type Material = "refraction" | "tactile" | "signal" | "folio" | "bloom" | "hybrid";

export const MATERIALS: readonly Material[] = [
  "refraction",
  "tactile",
  "signal",
  "folio",
  "bloom",
  "hybrid",
] as const;

/**
 * The platform whose conventions a subtree follows: type family, control
 * height, corner scale, primary-action shape, and focus style. Like material,
 * it is an axis set by `data-platform`, inherited, and never branched on by a
 * component; it is not a component prop.
 */
export type Platform = "web" | "ios" | "android" | "windows" | "macos";

export const PLATFORMS: readonly Platform[] = ["web", "ios", "android", "windows", "macos"] as const;

/**
 * Props every Crystal Neuo component accepts, in every adapter.
 * `material` is optional everywhere: omitted means "inherit".
 */
export interface MaterialProps {
  /** Scope this component and its subtree to a material. Omit to inherit. */
  material?: Material;
}

/** RTL handling strategy for a component. */
export type RtlStrategy =
  | "logical-properties" // uses inline-start/end, no JS mirroring needed
  | "mirrored" // directional values are flipped under dir=rtl
  | "none"; // no directional concerns

/**
 * The contract for one component.
 * TVariant and TSize are string-literal unions specific to the component.
 */
export interface Contract<TVariant extends string = string, TSize extends string = string> {
  /** kebab-case component id, matches the CSS block name (cn-<name>). */
  name: string;
  /** Human description of the component's job. */
  description: string;
  /** Allowed variants. First entry is the default. */
  variants: readonly TVariant[];
  /** Default variant. Must be a member of `variants`. */
  defaultVariant: TVariant;
  /** Allowed sizes. First entry is the default. */
  sizes: readonly TSize[];
  /** Default size. Must be a member of `sizes`. */
  defaultSize: TSize;
  /** States this component styles explicitly. */
  states: readonly ComponentState[];
  /** WAI-ARIA pattern. */
  aria: AriaPattern;
  /** Required ARIA roles/states/properties on the rendered DOM. */
  ariaNotes: readonly string[];
  /** Complete keyboard map (empty for non-interactive components). */
  keyboard: readonly KeyBinding[];
  /** How RTL is handled. */
  rtl: RtlStrategy;
  /** Whether the component supports two-way binding (model). */
  model?: { prop: string; type: string };
  /** Whether the interactive hit target must meet the touch minimum. */
  touchTarget: boolean;
}

/** Helper to define a contract with literal inference preserved. */
export function defineContract<TVariant extends string, TSize extends string>(
  c: Contract<TVariant, TSize>,
): Contract<TVariant, TSize> {
  return c;
}
