// `#atelier-admin-pages` for unit tests: no custom pages
export default [] as { path: string, label: string, icon?: string, group?: string, order?: number, requires: string[], hidden?: boolean, component: () => Promise<unknown> }[]
