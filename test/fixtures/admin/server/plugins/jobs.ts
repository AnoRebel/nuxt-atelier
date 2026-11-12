import { defineJob } from '#atelier/server'

// Test probe: a job that always fails, for the dashboard's failed-jobs widget
export default () => {
  defineJob('test:explode', async () => {
    throw new Error('the webhook endpoint said no')
  })
}
