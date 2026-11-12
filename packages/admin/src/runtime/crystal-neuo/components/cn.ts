// Same dependency-free joiner as the React adapter. Crystal Neuo composes
// `cn-*` classes, so clsx/tailwind-merge are unnecessary.
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
