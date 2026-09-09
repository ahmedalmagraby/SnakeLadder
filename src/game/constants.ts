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
  bgBadge: string;
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
    bgBadge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
  },
  {
    id: 1,
    name: 'Rose',
    base: '#f43f5e',
    light: '#fbcfe8',
    dark: '#9f1239',
    accent: '#fb7185',
    glow: 'rgba(244, 63, 94, 0.55)',
    bgBadge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  },
  {
    id: 2,
    name: 'Lime',
    base: '#84cc16',
    light: '#d9f99d',
    dark: '#3f6212',
    accent: '#a3e635',
    glow: 'rgba(132, 204, 22, 0.55)',
    bgBadge: 'bg-lime-500/20 text-lime-300 border-lime-500/40',
  },
  {
    id: 3,
    name: 'Amber',
    base: '#f59e0b',
    light: '#fde68a',
    dark: '#92400e',
    accent: '#fbbf24',
    glow: 'rgba(245, 158, 11, 0.55)',
    bgBadge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  },
];

/* Dock positions for up to 4 tokens in Start Bay (Square 0) - separated cleanly from title */
export const START_POS: Pt[] = [
  { x: 182, y: 1017 },
  { x: 228, y: 1017 },
  { x: 274, y: 1017 },
  { x: 320, y: 1017 },
];

export function squareCenter(n: number): Pt {
  if (n <= 0) return { x: 251, y: 1017 };
  const i = n - 1;
  const r = Math.floor(i / 10);
  const c = r % 2 === 0 ? i % 10 : 9 - (i % 10);
  return { x: ORIGIN + c * CELL + CELL / 2, y: ORIGIN + (9 - r) * CELL + CELL / 2 };
}

/* Convert logical board coordinates into square number 1..100 */
export function squareFromPoint(lx: number, ly: number): number | null {
  const c = Math.floor((lx - ORIGIN) / CELL);
  const rowFromTop = Math.floor((ly - ORIGIN) / CELL);
  const r = 9 - rowFromTop;
  if (c < 0 || c > 9 || r < 0 || r > 9) return null;
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

const SNAKE_PALETTE: [string, string][] = [
  ['#ef4444', '#7f1d1d'],
  ['#f97316', '#7c2d12'],
  ['#a3e635', '#3f6212'],
  ['#22d3ee', '#155e75'],
  ['#e879f9', '#701a75'],
  ['#facc15', '#854d0e'],
  ['#4ade80', '#14532d'],
  ['#fb7185', '#881337'],
  ['#38bdf8', '#075985'],
  ['#fbbf24', '#92400e'],
];
export const snakeColor = (i: number) => SNAKE_PALETTE[i % SNAKE_PALETTE.length];

/* ---------- precomputed paths ---------- */

function buildSnakePath(head: number, tail: number): Pt[] {
  const a = squareCenter(head);
  const b = squareCenter(tail);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const px = -dy / len;
  const py = dx / len;
  const rnd = mulberry32(head * 31 + 7);
  const amp = 10 + rnd() * 14;
  const waves = 1.5 + rnd() * 1.3;
  const phase = rnd() * Math.PI;
  const n = Math.max(26, Math.round(len / 6));
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const wob = Math.sin(f * Math.PI * waves + phase) * amp * Math.sin(f * Math.PI);
    pts.push({ x: a.x + dx * f + px * wob, y: a.y + dy * f + py * wob });
  }
  return pts;
}

export const SNAKE_PATHS: Record<number, Pt[]> = {};
Object.keys(SNAKES).forEach((h) => {
  SNAKE_PATHS[Number(h)] = buildSnakePath(Number(h), SNAKES[Number(h)]);
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

