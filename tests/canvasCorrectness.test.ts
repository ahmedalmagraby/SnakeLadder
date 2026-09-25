import { describe, it, expect } from 'vitest';
import {
  PORTALS,
  SNAKE_PARAMS,
  getSnakeSpine,
  getSnakeSlidePoint,
  squareCenter,
  clamp,
  lerp,
  easeInOutCubic,
  pathCum,
  pointAt,
  type Pt,
} from '../src/game/constants';
import { getSegmentColors } from '../src/game/render';

describe('Snake Spine & Slide Point Consistency', () => {
  const snakeEntries = Object.entries(PORTALS)
    .filter(([_, p]) => p.type === 'snake')
    .map(([from, p]) => ({ from: Number(from), to: p.to }));

  it('precomputes wave parameters for every snake on the board', () => {
    expect(snakeEntries.length).toBeGreaterThan(0);
    for (const { from } of snakeEntries) {
      const params = SNAKE_PARAMS[from];
      expect(params).toBeDefined();
      expect(params.baseAmp).toBeGreaterThan(0);
      expect(params.waves).toBeGreaterThan(0);
      expect(params.speed).toBeGreaterThan(0);
    }
  });

  it('anchors slide point to square center at start (t=0) and destination at end (t=1)', () => {
    for (const { from, to } of snakeEntries) {
      const headCenter = squareCenter(from);
      const tailCenter = squareCenter(to);

      // t=0 (head)
      const ptStart = getSnakeSlidePoint(from, to, 0, 1000);
      const distStart = Math.hypot(ptStart.x - headCenter.x, ptStart.y - headCenter.y);
      // Allows small offset for head geometry
      expect(distStart).toBeLessThan(35);

      // t=1 (tail tip)
      const ptEnd = getSnakeSlidePoint(from, to, 1, 1000);
      const distEnd = Math.hypot(ptEnd.x - tailCenter.x, ptEnd.y - tailCenter.y);
      expect(distEnd).toBeLessThan(35);
    }
  });

  it('ensures slide point follows spine continuously with zero detachments', () => {
    const { from, to } = snakeEntries[0];
    const time = 500;

    let prevPt = getSnakeSlidePoint(from, to, 0, time);
    const steps = 50;

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const pt = getSnakeSlidePoint(from, to, t, time);
      const stepDist = Math.hypot(pt.x - prevPt.x, pt.y - prevPt.y);

      // Continuous motion: step distance should be small and smooth
      expect(stepDist).toBeLessThan(30);
      prevPt = pt;
    }
  });

  it('generates non-empty spine with bounded segment distances', () => {
    for (const { from, to } of snakeEntries) {
      const spine = getSnakeSpine(from, to, 1200);
      expect(spine.length).toBeGreaterThanOrEqual(15);

      for (let i = 1; i < spine.length; i++) {
        const segLen = Math.hypot(spine[i].x - spine[i - 1].x, spine[i].y - spine[i - 1].y);
        expect(segLen).toBeGreaterThan(0);
        expect(segLen).toBeLessThan(50);
      }
    }
  });
});

describe('Render Math & Helpers', () => {
  it('correctly clamps values', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('linearly interpolates between values', () => {
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 0.5)).toBe(15);
    expect(lerp(10, 20, 1)).toBe(20);
  });

  it('evaluates easeInOutCubic smoothly and monotonically', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);

    let prev = 0;
    for (let t = 0.1; t <= 1.0; t += 0.1) {
      const curr = easeInOutCubic(t);
      expect(curr).toBeGreaterThanOrEqual(prev);
      prev = curr;
    }
  });

  it('computes cumulative path distances with pathCum and pointAt', () => {
    const pts: Pt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    const { cum, total } = pathCum(pts);
    expect(cum).toHaveLength(3);
    expect(cum[0]).toBe(0);
    expect(cum[1]).toBe(100);
    expect(cum[2]).toBe(200);
    expect(total).toBe(200);

    const mid = pointAt(pts, cum, 50);
    expect(mid.x).toBeCloseTo(50);
    expect(mid.y).toBeCloseTo(0);

    const corner = pointAt(pts, cum, 100);
    expect(corner.x).toBeCloseTo(100);
    expect(corner.y).toBeCloseTo(0);

    const end = pointAt(pts, cum, 200);
    expect(end.x).toBeCloseTo(100);
    expect(end.y).toBeCloseTo(100);
  });

  it('caches segment colors with getSegmentColors', () => {
    const main = '#22c55e';
    const dark = '#15803d';

    const colors1 = getSegmentColors(main, dark, 20);
    expect(colors1).toHaveLength(20);

    // Memoization test: subsequent call returns identical reference
    const colors2 = getSegmentColors(main, dark, 20);
    expect(colors1).toBe(colors2);
  });
});
