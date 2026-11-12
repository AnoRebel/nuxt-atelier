// Where overlays of third-party components (date pickers, menus, modals of another UI library) should
// render: inside the admin's shadow root, where its styles apply and the site's don't. Pass it as the
// library's teleport or portal target. Outside the admin it's undefined.
import type { InjectionKey } from 'vue'
import { inject } from 'vue'

export const ADMIN_PORTAL: InjectionKey<HTMLElement> = Symbol('atelier-admin-portal')

export function useAtelierAdminPortal(): HTMLElement | undefined {
  return inject(ADMIN_PORTAL, undefined)
}
