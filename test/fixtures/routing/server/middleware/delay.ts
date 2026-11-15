// A slowdown injected on purpose (ATELIER_TEST_DELAY_MS): how scripts/bench.ts is shown to catch one.
export default defineEventHandler(async () => {
  const ms = Number(process.env.ATELIER_TEST_DELAY_MS ?? 0)
  if (ms > 0)
    await new Promise(resolve => setTimeout(resolve, ms))
})
