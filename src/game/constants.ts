export interface Pt {
  x: number;
  y: number;
}

/* Logical board coordinate space (canvas is scaled to fit) */
export const LOGICAL = 1040;
export const ORIGIN = 45;
export const CELL = 95;

/* Classic snake & ladder layout */
export const LADDERS: Record<number, number> = {
  1: 38,
  4: 14,
  9: 31,
  21: 42,
  28: 84,
  40: 59,
  51: 67,
  63: 81,
  71: 91,
  80: 100,
};

export const SNAKES: Record<number, number> = {
  16: 6,
  47: 26,
  49: 11,
  56: 53,
  62: 19,
  64: 60,
  87: 24,
  93: 73,
  95: 75,
  98: 79,
};

export interface PortalInfo {
  type: 'ladder' | 'snake';
  from: number;
  to: number;
  diff: number;
}

export const PORTALS: Record<number, PortalInfo> = {};
for (const [f, t] of Object.entries(LADDERS)) {
  const from = Number(f);
  PORTALS[from] = { type: 'ladder', from, to: t, diff: t - from };
}
for (const [f, t] of Object.entries(SNAKES)) {
  const from = Number(f);
  PORTALS[from] = { type: 'snake', from, to: t, diff: t - from };
}

/* 4 distinct player color palettes */
export interface PlayerPalette {
  id: number;
  name: string;
  base: string;
  light: string;
  dark: string;
  accent: string;
  glow: string;
}

export const PLAYER_COLORS: PlayerPalette[] = [
  {
    id: 0,
    name: 'Cyan',
    base: '#06b6d4',
    light: '#a5f3fc',
    dark: '#0e7490',
    accent: '#22d3ee',
    glow: 'rgba(6, 182, 212, 0.55)',
  },
  {
    id: 1,
    name: 'Rose',
    base: '#f43f5e',
    light: '#fbcfe8',
    dark: '#9f1239',
    accent: '#fb7185',
    glow: 'rgba(244, 63, 94, 0.55)',
  },
  {
    id: 2,
    name: 'Lime',
    base: '#84cc16',
    light: '#d9f99d',
    dark: '#3f6212',
    accent: '#a3e635',
    glow: 'rgba(132, 204, 22, 0.55)',
  },
  {
    id: 3,
    name: 'Amber',
    base: '#f59e0b',
    light: '#fde68a',
    dark: '#92400e',
    accent: '#fbbf24',
    glow: 'rgba(245, 158, 11, 0.55)',
  },
];

/**
 * Dock positions for up to 4 tokens in the Start Bay (square 0).
 *
 * (D1) These were 46px apart while tokens are drawn at r=22 (44px across), so a
 * 4-player start had essentially no breathing room and the docking dishes were
 * completely covered. The bay's usable span is ~166..356 (the title plaque
 * ends at 154, the divider is at 162, and the navigation arrow sits at 374), so
 * these are now spaced 54px apart, centred in that span.
 */
export const START_POS: Pt[] = [
  { x: 178, y: 1017 },
  { x: 232, y: 1017 },
  { x: 286, y: 1017 },
  { x: 340, y: 1017 },
];

export function squareCenter(n: number): Pt {
  // (I2) This used to hardcode x=251, which is not any of the four dock
  // positions, so anything falling back to "square 0" (e.g. emote spawns) drew
  // a token floating in the middle of the bay.
  if (n <= 0) return START_POS[0];
  const i = n - 1;
  const r = Math.floor(i / 10);
  const c = r % 2 === 0 ? i % 10 : 9 - (i % 10);
  return { x: ORIGIN + c * CELL + CELL / 2, y: ORIGIN + (9 - r) * CELL + CELL / 2 };
}

/* Convert logical board coordinates into square number 1..100 */
export function squareFromPoint(lx: number, ly: number): number | null {
  /* (P2) The hit test now covers each cell's full span, edge to edge.
   *
   * The old form floored `(lx - ORIGIN) / CELL` and range-checked the *column
   * index* rather than the coordinate, which left a 1px sliver at every cell
   * boundary mapped to no square at all: `lx = 139.9999` gave column -1
   * (rejected) while `lx = 140` gave column 0 (square 1). Tapping exactly on a
   * grid line - which is where a player's finger naturally lands when they aim
   * for the line between two tiles - did nothing at all.
   *
   * Checking the coordinate against the cell bounds first means the test is a
   * true inverse of `squareCenter`: every point inside the 10x10 grid maps to
   * exactly one square, and every point outside it maps to none. */
  if (!Number.isFinite(lx) || !Number.isFinite(ly)) return null;
  const fx = lx - ORIGIN;
  const fy = ly - ORIGIN;
  if (fx < 0 || fy < 0 || fx >= CELL * 10 || fy >= CELL * 10) return null;

  const c = Math.floor(fx / CELL);
  const rowFromTop = Math.floor(fy / CELL);
  const r = 9 - rowFromTop;
  const colInRow = r % 2 === 0 ? c : 9 - c;
  const n = r * 10 + colInRow + 1;
  return n >= 1 && n <= 100 ? n : null;
}

/* Offset coordinates when multiple tokens share the same square */
export function getTokenSlotOffset(slotIndex: number, totalOnSquare: number): Pt {
  if (totalOnSquare <= 1) return { x: 0, y: 0 };
  if (totalOnSquare === 2) {
    return slotIndex === 0 ? { x: -16, y: 0 } : { x: 16, y: 0 };
  }
  if (totalOnSquare === 3) {
    if (slotIndex === 0) return { x: 0, y: -16 };
    if (slotIndex === 1) return { x: -16, y: 12 };
    return { x: 16, y: 12 };
  }
  // 4 tokens
  switch (slotIndex) {
    case 0:
      return { x: -16, y: -16 };
    case 1:
      return { x: 16, y: -16 };
    case 2:
      return { x: -16, y: 16 };
    default:
      return { x: 16, y: 16 };
  }
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/* (J5) Reduced-motion support. ------------------------------------------------
 * The OS-level `prefers-reduced-motion` setting used to be ignored entirely,
 * which matters for a board that is on screen continuously: the snakes
 * undulate, the frame sweeps, the motes drift, the camera shakes on a bite and
 * the win shower covers the whole screen.
 *
 * This only ever gates *decoration*. Turn order, hop timing, slide timing and
 * every roll outcome come from `SPEEDS` and the reducer, never from the
 * animation, so a reduced-motion match plays identically - it just stops
 * moving things that move for no informational reason.
 *
 * Deliberately *not* memoised: the render loop calls this once per frame, but
 * `matchMedia` costs microseconds, and caching the MediaQueryList would go
 * stale in any environment that replaces `window.matchMedia` (test harnesses,
 * embedded webviews). The guard also keeps this safe in node/jsdom-less runs,
 * where the answer is simply "no preference".
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hexLerp(c1: string, c2: string, t: number): string {
  const p = (c: string) => [
    parseInt(c.slice(1, 3), 16),
    parseInt(c.slice(3, 5), 16),
    parseInt(c.slice(5, 7), 16),
  ];
  const [r1, g1, b1] = p(c1);
  const [r2, g2, b2] = p(c2);
  return `rgb(${Math.round(lerp(r1, r2, t))},${Math.round(lerp(g1, g2, t))},${Math.round(
    lerp(b1, b2, t),
  )})`;
}

export interface SnakeWaveParams {
  baseAmp: number;
  waves: number;
  phase: number;
  speed: number;
}

export const SNAKE_PARAMS: Record<number, SnakeWaveParams> = {};
Object.keys(SNAKES).forEach((headStr, idx) => {
  const head = Number(headStr);
  const rnd = mulberry32(head * 31 + 7);
  SNAKE_PARAMS[head] = {
    baseAmp: 10 + rnd() * 12,
    waves: 1.4 + rnd() * 1.1,
    phase: rnd() * Math.PI * 2,
    speed: 2.2 + (idx % 3) * 0.45,
  };
});

/**
 * Shared mathematical spine generator for both animated snake rendering
 * and token movement during snake slides.
 *
 * (J5) `ampScale` damps the undulation for `prefers-reduced-motion` users. It
 * defaults to 1, so every existing caller - including the tests - is bit-for-bit
 * unchanged. It must never be 0 while a token is *sliding* along the spine,
 * because `getSnakeSlidePoint` reads positions straight off this geometry.
 */
/**
 * (P2) Compute the animated spine of a snake as a polyline of `n + 1` points.
 *
 * Pass `out` to reuse a caller-owned buffer. Without it this allocates a fresh
 * array of fresh point objects on every call, and the render loop calls it once
 * per snake per frame - around 800 short-lived objects per frame, ~48k per
 * second at 60fps. That is pure GC pressure on the main thread during the one
 * animation the whole board depends on reading correctly.
 *
 * The points are only ever read within the frame that produced them (the
 * renderer strokes straight from them), so mutating a reused buffer is safe.
 * Note the returned array must not be retained across frames by callers that
 * pass `out`.
 */
export function getSnakeSpine(
  head: number,
  tail: number,
  time = 0,
  isActive = false,
  customN?: number,
  ampScale = 1,
  out?: Pt[],
): Pt[] {
  const a = squareCenter(head);
  const b = squareCenter(tail);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const nx = dx / len;
  const ny = dy / len;

  const params = SNAKE_PARAMS[head] || {
    baseAmp: 16,
    waves: 2,
    phase: 0,
    speed: 2.5,
  };

  const amp = (isActive ? params.baseAmp * 1.3 : params.baseAmp) * ampScale;
  const speed = isActive ? 5.5 : params.speed;
  const headBob = isActive
    ? Math.sin(time * 16) * 4.2
    : Math.sin(time * 2.6 + params.phase) * 1.6;

  const n = customN ?? Math.max(28, Math.round(len / 5.5));
  /* (P2) Reuse the caller's buffer when given one, growing it only if this
   * snake needs more points than last frame. See the doc comment. */
  const pts = out ?? [];
  if (out) {
    while (pts.length < n + 1) pts.push({ x: 0, y: 0 });
    pts.length = n + 1;
  } else {
    pts.length = 0;
  }

  for (let i = 0; i <= n; i++) {
    const f = i / n;
    // Envelope is 0 at both head and tail so endpoints remain anchored to square centers
    const env = Math.sin(f * Math.PI);
    // Traveling wave equation along the snake's spine
    const wavePhase = f * Math.PI * params.waves * 2 + params.phase - time * speed;
    const wob = Math.sin(wavePhase) * amp * env;

    // Small head micro-motion along spine vector
    const bobOffset = headBob * Math.pow(1 - f, 2.5);

    const x = a.x + dx * f + px * wob + nx * bobOffset;
    const y = a.y + dy * f + py * wob + ny * bobOffset;

    if (out) {
      const slot = pts[i];
      slot.x = x;
      slot.y = y;
    } else {
      pts.push({ x, y });
    }
  }

  return pts;
}

/**
 * Samples a precise coordinate along the animated snake spine at frame time `time`.
 * Guaranteed to match the rendered snake geometry at that exact moment.
 *
 * (J5) `ampScale` must be the same value the renderer used for this frame,
 * otherwise the token visibly detaches from the body while it slides.
 */
export function getSnakeSlidePoint(
  head: number,
  tail: number,
  progress: number, // 0..1
  time = 0,
  isActive = true,
  ampScale = 1,
): Pt {
  const pts = getSnakeSpine(head, tail, time, isActive, undefined, ampScale);
  const { cum, total } = pathCum(pts);
  return pointAt(pts, cum, clamp(progress, 0, 1) * total);
}

export const SNAKE_PATHS: Record<number, Pt[]> = {};
Object.keys(SNAKES).forEach((h) => {
  SNAKE_PATHS[Number(h)] = getSnakeSpine(Number(h), SNAKES[Number(h)], 0, false);
});

export const LADDER_PATHS: Record<number, Pt[]> = {};
Object.keys(LADDERS).forEach((b) => {
  LADDER_PATHS[Number(b)] = [squareCenter(Number(b)), squareCenter(LADDERS[Number(b)])];
});

export function pathCum(pts: Pt[]): { cum: number[]; total: number } {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  return { cum, total: cum[cum.length - 1] };
}

export function pointAt(pts: Pt[], cum: number[], dist: number): Pt {
  const total = cum[cum.length - 1];
  if (dist <= 0) return pts[0];
  if (dist >= total) return pts[pts.length - 1];
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= dist) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi] - cum[lo] || 1;
  const f = (dist - cum[lo]) / seg;
  return { x: lerp(pts[lo].x, pts[hi].x, f), y: lerp(pts[lo].y, pts[hi].y, f) };
}

/* Speed options and game pacing */
export type GameSpeed = 'normal' | 'fast' | 'turbo';
export type WinRule = 'exact' | 'bounce';

export interface SpeedSetting {
  id: GameSpeed;
  label: string;
  hopMs: number;
  rollMs: number;
  slideMs: number;
  settleMs: number;
  aiDelayMs: number;
}

export const SPEEDS: Record<GameSpeed, SpeedSetting> = {
  normal: {
    id: 'normal',
    label: '1x Normal',
    hopMs: 180,
    rollMs: 950,
    slideMs: 950,
    settleMs: 320,
    aiDelayMs: 800,
  },
  fast: {
    id: 'fast',
    label: '1.5x Fast',
    hopMs: 120,
    rollMs: 650,
    slideMs: 650,
    settleMs: 220,
    aiDelayMs: 500,
  },
  turbo: {
    id: 'turbo',
    label: '2.5x Turbo',
    hopMs: 70,
    rollMs: 400,
    slideMs: 400,
    settleMs: 120,
    aiDelayMs: 300,
  },
};

/* Default fallback timings */
export const HOP_MS = SPEEDS.normal.hopMs;
export const ROLL_MS = SPEEDS.normal.rollMs;
export const SLIDE_MS = SPEEDS.normal.slideMs;

