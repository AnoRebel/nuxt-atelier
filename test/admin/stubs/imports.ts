// `#imports` for unit tests of the admin's composables: just what they use.
export const runtimeConfig = { public: { atelier: { admin: { base: '/admin', passkeys: false } } } }
export const useRuntimeConfig = () => runtimeConfig
