import { describe, expect, it } from 'vitest'
import { percentile, verdict } from './bench'

const run = (cached: number, uncached: number) => ({ cached, uncached, at: '' })

describe('benchmark verdict', () => {
  it('takes the p95', () => {
    expect(percentile(Array.from({ length: 100 }, (_, i) => i + 1), 0.95)).toBe(95)
  })
  it('fails over budget, and over 10% (and 2 ms) above the median of past runs', () => {
    expect(verdict(run(10, 100), [])).toEqual([])
    expect(verdict(run(51, 201), [])).toHaveLength(2)
    const history = [run(1, 15), run(1.2, 14), run(1, 16)]
    expect(verdict(run(1.15, 16.4), history)).toEqual([]) // within 10%, or within the noise floor
    expect(verdict(run(1, 17.5), history)).toEqual(['uncached p95 17.5 ms is more than 10% above the baseline median 15.0 ms'])
    expect(verdict(run(13, 15), history)).toHaveLength(1) // an injected 12 ms
  })
})
