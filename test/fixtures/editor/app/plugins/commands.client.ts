// A command a plugin adds to the editor's palette, and an action it adds to headlines.
import { addBlockActions, addEditorCommands } from '#atelier-editor'

export default defineNuxtPlugin(() => {
  addEditorCommands(context => [{
    id: 'fixture:shout',
    label: 'Shout the title',
    group: 'Fixture',
    run: () => context.setData({ ...context.data(), title: `${String(context.data().title ?? '').toUpperCase()}!` }),
  }])
  // a stand-in for "Translate block": a headline's action, not other blocks'
  addBlockActions((block, editor) => block.type === 'Headline'
    ? [{ id: 'fixture:translate', label: 'Translate block', run: () => editor.setProps(block.id, { ...block.props, heading: `[fr] ${String(block.props.heading)}` }) }]
    : [])
})
