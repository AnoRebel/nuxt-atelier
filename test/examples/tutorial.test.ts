// The Rayleigh tutorial's code is the example's (scripts/tutorial.ts): every example file belongs to a
// chapter, and every code block of a chapter's page is that file at that chapter.
import { describe, expect, it } from 'vitest'
import { atChapter, manifestProblems, tutorialPages } from '../../scripts/tutorial'

describe('the Rayleigh tutorial', () => {
  it('gives every file of the example a chapter', () => {
    expect(manifestProblems()).toEqual([])
  })

  it('shows each chapter the example\'s code at that chapter (run `bun scripts/tutorial.ts` to update)', () => {
    for (const page of tutorialPages())
      expect(page.current, page.path).toBe(page.expected)
  })

  it('keeps a later chapter\'s regions out of earlier ones', () => {
    const text = 'a\n// #region blog\nb\n/* #region contact */\nc\n/* #endregion */\n// #endregion\n<!-- #region seed -->\nd\n<!-- #endregion -->\ne'
    expect(atChapter(text, 0)).toBe('a\ne') // setup
    expect(atChapter(text, 4)).toBe('a\nb\ne') // blog, not contact (inside it) or seed
    expect(atChapter(text, 5)).toBe('a\nb\nc\ne')
    expect(atChapter(text, 7)).toBe('a\nb\nc\nd\ne') // the whole example
    expect(() => atChapter('// #region nope\nx\n// #endregion', 0)).toThrow('isn\'t a chapter')
    expect(() => atChapter('// #region blog\nx', 0)).toThrow('without #endregion')
  })
})
