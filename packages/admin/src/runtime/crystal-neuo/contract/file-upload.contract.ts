import { defineContract } from "./types";

export const fileUploadContract = defineContract({
  name: "file-upload",
  description: "File picker with a drop zone. Falls back to a native file input.",
  variants: ["default", "error"],
  defaultVariant: "default",
  sizes: ["md", "lg"],
  defaultSize: "md",
  states: ["default", "hover", "focus-visible", "disabled", "error"],
  aria: "none",
  ariaNotes: [
    'Native <input type="file"> is the source of truth; the drop zone is a labelled button that triggers it.',
    "Drag-over state is announced via a polite live region; not required to operate.",
  ],
  keyboard: [
    { key: "Enter", action: "Open the file dialog" },
    { key: "Space", action: "Open the file dialog" },
  ],
  rtl: "logical-properties",
  model: { prop: "files", type: "File[]" },
  touchTarget: true,
});

export type FileUploadVariant = (typeof fileUploadContract.variants)[number];
export type FileUploadSize = (typeof fileUploadContract.sizes)[number];

/**
 * Whether `file` satisfies an `accept` string as the native picker would read
 * it: comma-separated extensions (`.png`), exact MIME types (`image/png`), or
 * MIME wildcards (`image/*`). An empty `accept` admits everything.
 */
export function fileMatchesAccept(file: { name: string; type: string }, accept?: string): boolean {
  if (!accept) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return accept
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .some((token) => {
      if (token.startsWith(".")) return name.endsWith(token);
      if (token.endsWith("/*")) return type.startsWith(token.slice(0, -1));
      return type === token;
    });
}

/** Narrow dropped files to what the native input would have allowed. */
export function acceptedFiles<T extends { name: string; type: string }>(
  files: Iterable<T>,
  accept?: string,
  multiple?: boolean,
): T[] {
  const ok = Array.from(files).filter((f) => fileMatchesAccept(f, accept));
  return multiple ? ok : ok.slice(0, 1);
}
