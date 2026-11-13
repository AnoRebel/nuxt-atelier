// The form block: a form from the Forms collection, placed on a page (rendered by <AtelierForm>).
import { defineBlock, relation } from '#atelier'
import AtelierForm from '../../../../app/components/Form.vue'

export default defineBlock({
  component: AtelierForm,
  label: 'Form',
  icon: 'file-text',
  fields: { form: relation({ to: 'atelier-forms', required: true }) },
})
