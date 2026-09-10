export type BodyKnobs = {
  marginPct: number
  lineHeight: number
  fontEm: number
}

export function roundKnob(n: number, places: number): number {
  const f = 10 ** places
  return Math.round(n * f) / f
}

/** Keep unsaved CSS when a fresh seed arrives; take the seed only when clean. */
export function takeStyleSeed(
  seed: string,
  css: string,
  saved: string,
): { css: string; saved: string } | null {
  if (!seed) return null
  if (css !== saved) return null
  if (css === seed) return null
  return { css: seed, saved: seed }
}

const BODY_BLOCK = /(?:^|\n)body\s*\{[\s\S]*?\n\}/

export function bodySideMarginPct(css: string): number | null {
  const match = css.match(BODY_BLOCK)
  const src = match ? match[0] : css
  const m = src.match(/\bmargin:\s*0\s+(\d+(?:\.\d+)?)%/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

export function parseBodyKnobs(css: string): BodyKnobs | null {
  const match = css.match(BODY_BLOCK)
  if (!match) return null
  const block = match[0]
  const margin = block.match(/\bmargin:\s*0\s+(\d+(?:\.\d+)?)%/)
  const lh = block.match(/\bline-height:\s*(\d+(?:\.\d+)?)/)
  const fs = block.match(/\bfont-size:\s*(\d+(?:\.\d+)?)em/)
  if (!margin || !lh || !fs) return null
  const knobs: BodyKnobs = {
    marginPct: roundKnob(Number(margin[1]), 1),
    lineHeight: roundKnob(Number(lh[1]), 2),
    fontEm: roundKnob(Number(fs[1]), 2),
  }
  if (
    !Number.isFinite(knobs.marginPct) ||
    !Number.isFinite(knobs.lineHeight) ||
    !Number.isFinite(knobs.fontEm)
  ) {
    return null
  }
  return knobs
}

export function applyBodyKnobs(css: string, knobs: BodyKnobs): string {
  return css.replace(BODY_BLOCK, (block) =>
    block
      .replace(/\bmargin:\s*[^;]+/, `margin: 0 ${knobs.marginPct}%`)
      .replace(/\bline-height:\s*[^;]+/, `line-height: ${knobs.lineHeight}`)
      .replace(/\bfont-size:\s*[^;]+/, `font-size: ${knobs.fontEm}em`),
  )
}
