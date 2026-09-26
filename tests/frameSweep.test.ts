/**
 * Proves the `drawFrameSweep` / `framePoint` geometry with real numbers.
 *
 * `framePoint` is re-implemented here verbatim from `src/game/render.ts` so the
 * walk can be measured rather than asserted, and the corrected version is
 * measured alongside it.
 */
import { describe, it, expect } from 'vitest';
import { LOGICAL, ORIGIN } from '../src/game/constants';

const BAND = ORIGIN - 4;
type Pt = { x: number; y: number };

/** The original implementation, verbatim from render.ts. */
function framePointOld(d: number, band: number): Pt {
  const top = band;
  const bottom = LOGICAL - band;
  let dd = d;
  if (dd < LOGICAL) return { x: dd, y: top };
  if ((dd -= LOGICAL) < band * 2) return { x: LOGICAL, y: top + dd };
  if ((dd -= band * 2) < LOGICAL) return { x: LOGICAL - dd, y: bottom };
  dd -= LOGICAL;
  return { x: 0, y: bottom - dd };
}

/** Corrected: walks a closed rectangle around the bezel. */
function framePointNew(d: number, band: number): Pt {
  const top = band;
  const bottom = LOGICAL - band;
  const rail = bottom - top; // full side length between the two edges
  let dd = d;
  if (dd < LOGICAL) return { x: dd, y: top };
  if ((dd -= LOGICAL) < rail) return { x: LOGICAL, y: top + dd };
  if ((dd -= rail) < LOGICAL) return { x: LOGICAL - dd, y: bottom };
  dd -= LOGICAL;
  return { x: 0, y: bottom - dd };
}

/** Length the old walk actually covers. */
const OLD_WALK = 2 * (LOGICAL + BAND * 2); // 2244
/** Length of the real bezel centre-line. */
const TRUE_PERIMETER = 4 * LOGICAL - 4 * BAND; // 3996
/** What the original code passed as the total. */
const LEGACY_PERIMETER = LOGICAL * 4; // 4160

describe('frame band geometry', () => {
  it('documents the real dimensions', () => {
    expect(LOGICAL).toBe(1040);
    expect(ORIGIN).toBe(45);
    expect(BAND).toBe(41);
    expect(OLD_WALK).toBe(2244);
    expect(TRUE_PERIMETER).toBe(3996);
    expect(LEGACY_PERIMETER).toBe(4160);
  });
});

describe('the original framePoint did not trace a closed loop', () => {
  it('walks only band*2 of each vertical rail, not the full side', () => {
    // Right rail: from the top edge down by band*2 = 82px, but the side is 958px.
    const afterTopEdge = framePointOld(LOGICAL, BAND);
    expect(afterTopEdge.y).toBe(BAND); // 41
    const endOfRightRail = framePointOld(LOGICAL + BAND * 2 - 1, BAND);
    expect(endOfRightRail.y).toBe(BAND + BAND * 2 - 1); // 122
    // It jumps straight to the bottom edge from there - the corner and the
    // remaining ~876px of the right side are never visited.
    expect(endOfRightRail.y).toBeLessThan(999);
  });

  it('ends at the bottom-left stub, not back at the start', () => {
    const start = framePointOld(0, BAND);
    const end = framePointOld(OLD_WALK - 1, BAND);
    // Start (0, 41), end (0, 918) - a ~877px gap for the sweep to jump.
    expect(start.y).toBe(41);
    expect(end.y).toBe(918);
    expect(Math.abs(start.y - end.y)).toBeGreaterThan(800);
  });

  it('drew off the top-left of the canvas for part of every cycle', () => {
    let offCanvas = 0;
    let total = 0;
    for (let i = 0; i <= 400; i++) {
      const start = (i / 400) * LEGACY_PERIMETER;
      for (let s = 0; s <= 10; s++) {
        total++;
        const pt = framePointOld((start + (s / 10) * 190) % LEGACY_PERIMETER, BAND);
        if (pt.y < 0 || pt.x < 0 || pt.x > LOGICAL || pt.y > LOGICAL) offCanvas++;
      }
    }
    const fraction = offCanvas / total;
    // ~24% of every 9s cycle was drawn outside the canvas.
    expect(fraction).toBeGreaterThan(0.2);
    expect(fraction).toBeLessThan(0.3);
  });
});

describe('the corrected framePoint traces a closed bezel loop', () => {
  it('covers the full vertical rails', () => {
    const afterTopEdge = framePointNew(LOGICAL, BAND);
    expect(afterTopEdge.y).toBe(BAND);
    // Right rail now spans the whole side.
    const endOfRightRail = framePointNew(LOGICAL + (LOGICAL - 2 * BAND) - 1, BAND);
    expect(endOfRightRail.y).toBe(999 - 1);
  });

  it('returns exactly to its starting point after one lap', () => {
    const start = framePointNew(0, BAND);
    const end = framePointNew(TRUE_PERIMETER - 0.001, BAND);
    expect(start.x).toBeCloseTo(end.x, 2);
    expect(start.y).toBeCloseTo(end.y, 2);
  });

  it('never leaves the canvas across a whole cycle', () => {
    let offCanvas = 0;
    for (let i = 0; i <= 2000; i++) {
      const d = (i / 2000) * TRUE_PERIMETER;
      const pt = framePointNew(d, BAND);
      if (pt.y < 0 || pt.x < 0 || pt.x > LOGICAL || pt.y > LOGICAL) offCanvas++;
    }
    expect(offCanvas).toBe(0);
  });

  it('stays on the bezel band, never over a playable square', () => {
    for (let i = 0; i <= 2000; i++) {
      const pt = framePointNew((i / 2000) * TRUE_PERIMETER, BAND);
      const onHorizontalEdge = pt.y === BAND || pt.y === LOGICAL - BAND;
      const onVerticalEdge = pt.x === 0 || pt.x === LOGICAL;
      expect(onHorizontalEdge || onVerticalEdge, `d=${((i / 2000) * TRUE_PERIMETER).toFixed(0)}`).toBe(true);
      // Never inside the play area.
      const insidePlayArea =
        pt.x > ORIGIN && pt.x < LOGICAL - ORIGIN && pt.y > ORIGIN && pt.y < LOGICAL - ORIGIN;
      expect(insidePlayArea).toBe(false);
    }
  });
});
