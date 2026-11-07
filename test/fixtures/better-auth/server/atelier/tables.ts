import { betterAuthTables } from '@nuxt-atelier/auth-better-auth/config'
import { defineTables } from '#atelier/server'
import auth from './auth'

export default defineTables(betterAuthTables(auth))
