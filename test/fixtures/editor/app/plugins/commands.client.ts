// A command a plugin adds to the editor's palette.
import { addEditorCommands } from '#atelier-editor'

export default defineNuxtPlugin(() => {
  addEditorCommands(context => [{
    id: 'fixture:shout',
    label: 'Shout the title',
    group: 'Fixture',
    run: () => context.setData({ ...context.data(), title: `${String(context.data().title ?? '').toUpperCase()}!` }),
  }])
})
