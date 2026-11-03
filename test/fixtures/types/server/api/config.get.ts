import { defineEventHandler } from 'nuxt/server'
import { useAtelierServerConfig } from '#atelier/server'

export default defineEventHandler(() => {
  const url: string = useAtelierServerConfig().databaseUrl
  const dir: string = useAtelierServerConfig().storage.dir
  // @ts-expect-error unknown key
  void useAtelierServerConfig().nope
  return { url, dir }
})
