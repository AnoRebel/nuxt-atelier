// In-place rich-text editing in the visual editor's preview (the page side, loaded in an edit session on
// the first double click on a rich-text field): Tiptap 3 with the admin's rich-text set, storing the same
// ProseMirror JSON. Replaces core's `#atelier-inline-rich`.
import type { InlineRich } from '#atelier/editor/rich-off'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'

export const inlineRich: InlineRich = (element, value, change) => {
  const editor = new Editor({
    element,
    content: (value as Record<string, unknown> | null) ?? '',
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: true, defaultProtocol: 'https' } })],
    onUpdate: ({ editor: e }) => change(e.isEmpty ? null : e.getJSON() as { type: 'doc' }),
  })
  editor.commands.focus('end')
  return () => editor.destroy()
}
