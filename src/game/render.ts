import type { Pt } from './constants';
import {
  CELL,
  LADDERS,
  LOGICAL,
  ORIGIN,
  PLAYER_COLORS,
  PORTALS,
  SNAKES,
  START_POS,
  clamp,
  hexLerp,
  mulberry32,
  squareCenter,
  getSnakeSpine,
  SNAKE_PARAMS,
} from './constants';
import type { PlayerConfig } from './gameReducer';
import { THEMES, type BoardTheme } from './themes';

/* Memoized segment color cache for fast 60fps rendering without allocations */
const segmentColorCache = new Map<string, string[]>();
export function getSegmentColors(main: string, dark: string, n: number): string[] {
  const key = `${main}_${dark}_${n}`;
  let cached = segmentColorCache.get(key);
  if (!cached) {
    cached = [];
    for (let i = 0; i < n; i++) {
      cached.push(hexLerp(main, dark, i / n));
    }
    segmentColorCache.set(key, cached);
  }
  return cached;
}

/* ---------------- particles ---------------- */

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: 'dust' | 'spark' | 'confetti' | 'firework' | 'ring';
  rot: number;
  vr: number;
  g: number;
}

export function updateParticles(ps: Particle[], dt: number) {
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    p.life -= dt;
    if (p.life <= 0 || p.y > LOGICAL + 80) {
      ps.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += p.g * dt;
    p.rot += p.vr * dt;
  }
}

export function spawnDust(ps: Particle[], x: number, y: number, color = '#a7f3d0') {
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 25 + Math.random() * 55;
    ps.push({
      x: x + (Math.random() - 0.5) * 16,
      y: y + 8,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s * 0.35 - 16,
      life: 0.45,
      maxLife: 0.45,
      size: 3 + Math.random() * 5,
      color,
      kind: 'dust',
      rot: 0,
      vr: 0,
      g: 70,
    });
  }
}

export function spawnSpark(ps: Particle[], x: number, y: number, color = '#ffd75e') {
  ps.push({
    x,
    y,
    vx: (Math.random() - 0.5) * 110,
    vy: (Math.random() - 0.5) * 110 - 25,
    life: 0.5 + Math.random() * 0.4,
    maxLife: 0.9,
    size: 2.5 + Math.random() * 3.5,
    color,
    kind: 'spark',
    rot: 0,
    vr: 0,
    g: -35,
  });
}

/* (E1) Confetti/firework palettes are now theme-driven. The caller passes
   `theme.ui.celebrate`; jungle's list is the exact array that was hardcoded
   here before, so the default celebration looks identical. */
export function spawnConfetti(ps: Particle[], colors: string[]) {
  const palette = colors.length ? colors : ['#fbbf24', '#ffffff'];
  for (let i = 0; i < 80; i++) {
    ps.push({
      x: Math.random() * LOGICAL,
      y: -20 - Math.random() * 80,
      vx: (Math.random() - 0.5) * 110,
      vy: 70 + Math.random() * 140,
      life: 3.2 + Math.random() * 2.8,
      maxLife: 6.0,
      size: 6 + Math.random() * 7,
      color: palette[(Math.random() * palette.length) | 0],
      kind: 'confetti',
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 10,
      g: 50,
    });
  }
}

export function spawnFirework(ps: Particle[], cx: number, cy: number, colors: string[]) {
  const palette = colors.length ? colors : ['#fbbf24', '#ffffff'];
  const burstColor = palette[(Math.random() * palette.length) | 0];
  for (let i = 0; i < 36; i++) {
    const angle = (i * Math.PI * 2) / 36;
    const speed = 70 + Math.random() * 130;
    ps.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.8 + Math.random() * 0.6,
      maxLife: 1.4,
      size: 3 + Math.random() * 4,
      color: burstColor,
      kind: 'firework',
      rot: 0,
      vr: 0,
      g: 30,
    });
  }
}

/**
 * (E3/C8) A one-shot expanding ring used for landings, bites and ladder
 * arrivals. Drawn as a particle so it inherits the existing lifetime/culling
 * machinery rather than needing its own state.
 */
export function spawnRing(
  ps: Particle[],
  x: number,
  y: number,
  color: string,
  opts: { size?: number; life?: number; thickness?: number } = {},
) {
  const life = opts.life ?? 0.55;
  ps.push({
    x,
    y,
    vx: 0,
    vy: 0,
    life,
    maxLife: life,
    size: opts.size ?? 14,
    color,
    kind: 'ring',
    rot: opts.thickness ?? 3,
    vr: 0,
    g: 0,
  });
}

export function drawParticles(ctx: CanvasRenderingContext2D, ps: Particle[]) {
  for (const p of ps) {
    const a = clamp(p.life / p.maxLife, 0, 1);
    if (p.kind === 'confetti') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.min(1, a * 2.5);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    } else if (p.kind === 'ring') {
      // Expanding shockwave. `a` runs 1 -> 0 over the particle's life.
      const grow = 1 - a;
      const r = p.size + grow * p.size * 2.4;
      ctx.save();
      ctx.globalAlpha = a * a * 0.85;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(0.5, p.rot * a);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (p.kind === 'spark' || p.kind === 'firework') {
      ctx.globalAlpha = Math.min(1, a * 1.8);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.6), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = a * 0.45;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1.3 - a * 0.3), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  ctx.globalAlpha = 1;
}

/* ---------------- static board art (pre-rendered once) ---------------- */

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/* ------------------------------------------------------------------ *
 * (F4) Hand-drawn glyph primitives.
 *
 * The ladder/snake badges used to print "\u25B238" and "\u25BC24" and the START
 * bay printed "\u2794" using the "Lilita One" webfont. That font has none of
 * those glyphs, so every browser silently fell back to a *different* system
 * font - which is why the arrows looked subtly different on Windows, macOS and
 * Android. Drawing them as paths makes them identical everywhere.
 * ------------------------------------------------------------------ */

/** Solid triangle pointing up (used for ladder "+N" badges). */
function drawTriUp(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.lineTo(x + s * 0.92, y + s * 0.72);
  ctx.lineTo(x - s * 0.92, y + s * 0.72);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** Solid triangle pointing down (used for snake "-N" badges). */
function drawTriDown(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  drawTriUp(ctx, x, y, s, color);
}

/** Horizontal chevron arrow pointing right (START bay navigation). */
function drawChevron(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.6, s * 0.42);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.85, y - s * 0.7);
  ctx.lineTo(x + s * 0.5, y);
  ctx.lineTo(x - s * 0.85, y + s * 0.7);
  ctx.stroke();
  ctx.restore();
}

/** Filled right-pointing arrow head, used for direction hints. */
function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  size: number,
  color: string,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size * 0.8, size * 0.72);
  ctx.lineTo(-size * 0.45, 0);
  ctx.lineTo(-size * 0.8, -size * 0.72);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function drawLadder(
  ctx: CanvasRenderingContext2D,
  b: number,
  t: number,
  theme: BoardTheme = THEMES.jungle,
) {
  const a = squareCenter(b);
  const c = squareCenter(t);
  const dx = c.x - a.x;
  const dy = c.y - a.y;
  const len = Math.hypot(dx, dy);
  const px = (-dy / len) * 13;
  const py = (dx / len) * 13;
  ctx.lineCap = 'round';

  const rail = (ox: number, oy: number) => {
    ctx.beginPath();
    ctx.moveTo(a.x + ox, a.y + oy);
    ctx.lineTo(c.x + ox, c.y + oy);
    ctx.stroke();
  };

  const tb = theme.board;

  // (C3) Soft ambient bloom bled out behind the rails so ladders sit *in* the
  // board rather than looking pasted on top of it.
  ctx.save();
  ctx.strokeStyle = tb.ladderAmbientGlow;
  ctx.lineWidth = 26;
  ctx.lineCap = 'round';
  ctx.filter = 'blur(6px)';
  rail(px, py);
  rail(-px, -py);
  ctx.restore();

  // Outer dark shadow
  ctx.strokeStyle = tb.ladderRailShadow;
  ctx.lineWidth = 12;
  rail(px + 2, py + 3);
  rail(-px + 2, -py + 3);

  // Rail core
  ctx.strokeStyle = tb.ladderRailCore;
  ctx.lineWidth = 10;
  rail(px, py);
  rail(-px, -py);

  // Polish highlight
  ctx.strokeStyle = tb.ladderRailPolish;
  ctx.lineWidth = 6;
  rail(px, py);
  rail(-px, -py);

  ctx.strokeStyle = tb.ladderRailHighlight;
  ctx.lineWidth = 2;
  rail(px - 1.2, py - 1.2);
  rail(-px - 1.2, -py - 1.2);

  // Theme-specific rail glows
  if (tb.ladderStyle === 'neon') {
    ctx.save();
    ctx.shadowColor = tb.ladderRailPolish;
    ctx.shadowBlur = 10;
    ctx.strokeStyle = tb.ladderRailPolish;
    ctx.lineWidth = 3;
    rail(px, py);
    rail(-px, -py);
    ctx.restore();
  } else if (tb.ladderStyle === 'starlight') {
    ctx.save();
    ctx.shadowColor = tb.ladderGlowColor;
    ctx.shadowBlur = 9;
    ctx.strokeStyle = tb.ladderRailHighlight;
    ctx.lineWidth = 2.5;
    rail(px, py);
    rail(-px, -py);
    ctx.restore();
  }

  // Candy cane spiral stripes for sweet kingdom
  if (tb.ladderStyle === 'candycane') {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 3;
    const stripeCount = Math.floor(len / 16);
    for (let i = 0; i <= stripeCount; i++) {
      const f = i / stripeCount;
      const rx = a.x + dx * f;
      const ry = a.y + dy * f;
      ctx.beginPath();
      ctx.moveTo(rx + px - 3, ry + py - 3);
      ctx.lineTo(rx + px + 3, ry + py + 3);
      ctx.moveTo(rx - px - 3, ry - py - 3);
      ctx.lineTo(rx - px + 3, ry - py + 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Rungs
  const count = Math.max(3, Math.floor(len / 38));
  for (let i = 1; i <= count; i++) {
    const f = i / (count + 1);
    const x = a.x + dx * f;
    const y = a.y + dy * f;

    // Rung shadow
    ctx.strokeStyle = tb.ladderRungShadow;
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(x + px + 1, y + py + 2);
    ctx.lineTo(x - px + 1, y - py + 2);
    ctx.stroke();

    // Rung body
    ctx.strokeStyle = tb.ladderRailCore;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(x + px, y + py);
    ctx.lineTo(x - px, y - py);
    ctx.stroke();

    // Rung gold/brass/neon
    ctx.strokeStyle = tb.ladderRungColor;
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(x + px, y + py);
    ctx.lineTo(x - px, y - py);
    ctx.stroke();

    // Rung highlight
    ctx.strokeStyle = tb.ladderRungHighlight;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + px, y + py - 1);
    ctx.lineTo(x - px, y - py - 1);
    ctx.stroke();

    // Rung rivet dots / gemstone caps
    ctx.fillStyle = tb.ladderRivetColor;
    ctx.beginPath();
    ctx.arc(x + px, y + py, 2.5, 0, Math.PI * 2);
    ctx.arc(x - px, y - py, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawAnimatedSnake(
  ctx: CanvasRenderingContext2D,
  headNum: number,
  tailNum: number,
  idx: number,
  time: number,
  isActive: boolean,
  theme: BoardTheme = THEMES.jungle,
  ampScale = 1,
) {
  const tb = theme.board;
  const palette = tb.snakePalette;
  const [main, dark] = palette[idx % palette.length];
  const pts = getSnakeSpine(headNum, tailNum, time, isActive, undefined, ampScale);
  const n = pts.length - 1;
  const params = SNAKE_PARAMS[headNum] || { phase: 0 };
  const phase = params.phase;

  // Breathing oscillation. (J5) Scaled with the spine so a reduced-motion board
  // does not keep a body that has stopped undulating.
  const breathe = isActive
    ? Math.sin(time * 7.5) * 2.2 * ampScale
    : Math.sin(time * 2.4 + phase) * 1.2 * ampScale;

  const wAt = (f: number) =>
    Math.max(4, 24 * (1 - f * 0.65) + 5 + breathe * Math.sin(f * Math.PI));

  ctx.lineCap = 'round';

  const seg = (i: number, w: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(pts[i].x, pts[i].y);
    ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
    ctx.stroke();
  };

  // 1. Drop shadow under snake body
  for (let i = 0; i < n; i++) {
    ctx.strokeStyle = tb.snakeDropShadow;
    ctx.lineWidth = wAt(i / n) + 5;
    ctx.beginPath();
    ctx.moveTo(pts[i].x + 2.5, pts[i].y + 3.5);
    ctx.lineTo(pts[i + 1].x + 2.5, pts[i + 1].y + 3.5);
    ctx.stroke();
  }

  // 2. Dark outer outline
  for (let i = 0; i < n; i++) {
    seg(i, wAt(i / n) + 4.5, tb.snakeOutline);
  }

  // 3. Colored body gradient with cached segment colors
  const segColors = getSegmentColors(main, dark, n);
  for (let i = 0; i < n; i++) {
    seg(i, wAt(i / n), segColors[i] || main);
  }

  // 4. Style-specific spine patterns
  if (tb.snakeStyle === 'cyber') {
    // Cyber digital energy segments and neon pulses
    for (let i = 1; i < n; i += 3) {
      const f = i / n;
      const pulse = Math.sin(f * 18 - time * 6 + phase) * 0.5 + 0.5;
      const pt = pts[i];
      const next = pts[i + 1] || pt;
      const tdx = next.x - pt.x;
      const tdy = next.y - pt.y;
      const tlen = Math.hypot(tdx, tdy) || 1;
      const npx = (-tdy / tlen) * (wAt(f) * 0.46);
      const npy = (tdx / tlen) * (wAt(f) * 0.46);
      ctx.save();
      ctx.strokeStyle = pulse > 0.6 ? tb.snakeDetailA : tb.snakeDetailB;
      ctx.lineWidth = 2.4;
      ctx.shadowColor = tb.snakeDetailGlow;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(pt.x - npx, pt.y - npy);
      ctx.lineTo(pt.x + npx, pt.y + npy);
      ctx.stroke();
      ctx.restore();
    }
  } else if (tb.snakeStyle === 'cosmic') {
    // Celestial stardust particles & glowing astral nodes
    for (let i = 1; i < n; i += 2) {
      const f = i / n;
      const starTwinkle = Math.sin(f * 20 + time * 4.5 + phase) * 0.5 + 0.5;
      if (starTwinkle > 0.35) {
        ctx.save();
        ctx.fillStyle = starTwinkle > 0.75 ? tb.snakeDetailA : tb.snakeDetailB;
        ctx.shadowColor = tb.snakeDetailGlow;
        ctx.shadowBlur = 5;
        const pt = pts[i];
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2 * starTwinkle, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  } else if (tb.snakeStyle === 'gummy') {
    // Translucent gummy candy stripes & sweet sugar shine
    for (let i = 1; i < n; i += 3) {
      const f = i / n;
      const pt = pts[i];
      const next = pts[i + 1] || pt;
      const tdx = next.x - pt.x;
      const tdy = next.y - pt.y;
      const tlen = Math.hypot(tdx, tdy) || 1;
      const npx = (-tdy / tlen) * (wAt(f) * 0.42);
      const npy = (tdx / tlen) * (wAt(f) * 0.42);
      ctx.save();
      ctx.strokeStyle = i % 2 === 0 ? tb.snakeDetailA : tb.snakeDetailB;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pt.x - npx, pt.y - npy);
      ctx.lineTo(pt.x + npx, pt.y + npy);
      ctx.stroke();
      ctx.restore();
    }
  } else if (tb.snakeStyle === 'pharaoh') {
    // Royal golden cobra collar and lapis lazuli rings
    for (let i = 1; i < n; i += 4) {
      const f = i / n;
      const pt = pts[i];
      const next = pts[i + 1] || pt;
      const tdx = next.x - pt.x;
      const tdy = next.y - pt.y;
      const tlen = Math.hypot(tdx, tdy) || 1;
      const npx = (-tdy / tlen) * (wAt(f) * 0.48);
      const npy = (tdx / tlen) * (wAt(f) * 0.48);
      ctx.save();
      ctx.strokeStyle = i % 2 === 0 ? tb.snakeDetailA : tb.snakeDetailB;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(pt.x - npx, pt.y - npy);
      ctx.lineTo(pt.x + npx, pt.y + npy);
      ctx.stroke();
      ctx.restore();
    }
  } else {
    // Natural diamond specular scale shimmer
    for (let i = 1; i < n; i++) {
      const f = i / n;
      const shimmer = Math.sin(f * 14 - time * 3.8 + phase) * 0.5 + 0.5;
      const alpha = 0.12 + shimmer * 0.42;
      ctx.save();
      ctx.globalAlpha = alpha;
      seg(i, wAt(f) * 0.45, tb.snakeSpecular);
      ctx.restore();
    }
  }

  // 5. Head calculation
  const h = pts[0];
  const ddx = h.x - pts[1].x;
  const ddy = h.y - pts[1].y;
  const dl = Math.hypot(ddx, ddy) || 1;
  const d = { x: ddx / dl, y: ddy / dl };
  const ang = Math.atan2(d.y, d.x);

  // 6. Realistic forked tongue with natural flick rhythm
  const flickPeriod = 3.6 + (idx % 4) * 0.7;
  const flickTimer = (time + idx * 1.7) % flickPeriod;
  const flickDuration = 0.6;
  const isFlicking = isActive || flickTimer < flickDuration;

  if (isFlicking) {
    const progress = isActive ? 1.0 : flickTimer / flickDuration;
    // Rapid dart out, sustain wag, rapid retract
    const extFactor = isActive
      ? 0.85 + 0.15 * Math.sin(time * 26)
      : Math.sin(progress * Math.PI);
    const tongueReach = 18 * extFactor;

    if (tongueReach > 2) {
      const wag = Math.sin(time * 38 + idx) * 3.5 * extFactor;
      const tx = h.x + d.x * (10 + tongueReach) - d.y * wag;
      const ty = h.y + d.y * (10 + tongueReach) + d.x * wag;

      ctx.save();
      ctx.strokeStyle = isActive ? tb.activeTongueColor : tb.tongueColor;
      ctx.lineWidth = 2.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      // Base of tongue coming from mouth
      ctx.moveTo(h.x + d.x * 8, h.y + d.y * 8);
      ctx.lineTo(tx, ty);
      // Fork tips
      const forkSpread = 4.2 * extFactor;
      const forkLen = 6.5 * extFactor;
      ctx.lineTo(tx + d.x * forkLen - d.y * forkSpread, ty + d.y * forkLen + d.x * forkSpread);
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx + d.x * forkLen + d.y * forkSpread, ty + d.y * forkLen - d.x * forkSpread);
      ctx.stroke();
      ctx.restore();
    }
  }

  // 7. Head shape and features
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(ang);

  // Active strike / venom aura
  if (isActive) {
    const auraPulse = 0.4 + 0.3 * Math.sin(time * 12);
    ctx.shadowColor = tb.activeAuraColor;
    ctx.shadowBlur = 18;
    ctx.fillStyle = tb.activeAuraColor;
    ctx.globalAlpha = auraPulse;
    ctx.beginPath();
    ctx.ellipse(8, 0, 28, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  // Head shadow
  ctx.fillStyle = tb.snakeDropShadow;
  ctx.beginPath();
  ctx.ellipse(8, 3.5, 24, 18, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head base
  const hg = ctx.createRadialGradient(-4, -6, 2, 0, 0, 28);
  hg.addColorStop(0, main);
  hg.addColorStop(1, dark);
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.ellipse(6, 0, 23, 17, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = tb.snakeOutline;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Active mouth gaping & fangs
  if (isActive) {
    ctx.fillStyle = tb.snakeMouth;
    ctx.beginPath();
    ctx.ellipse(14, 0, 8, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Viper needle fangs
    ctx.fillStyle = '#ffffff';
    // Top fang
    ctx.beginPath();
    ctx.moveTo(15, -4.5);
    ctx.lineTo(20, -3.8);
    ctx.lineTo(15, -2.5);
    ctx.closePath();
    ctx.fill();
    // Bottom fang
    ctx.beginPath();
    ctx.moveTo(15, 4.5);
    ctx.lineTo(20, 3.8);
    ctx.lineTo(15, 2.5);
    ctx.closePath();
    ctx.fill();
  }

  // 8. Natural blinking predatory eyes
  const blinkPeriod = 4.2 + (idx % 3) * 0.9;
  const blinkTimer = (time + idx * 2.4) % blinkPeriod;
  const isBlinking = !isActive && blinkTimer < 0.16;
  const eyeScaleY = isBlinking
    ? Math.max(0.08, 1 - Math.sin((blinkTimer / 0.16) * Math.PI))
    : 1.0;

  for (const s of [-1, 1]) {
    const eyeY = s * 9;
    ctx.save();
    ctx.translate(11, eyeY);
    ctx.scale(1, eyeScaleY);

    // Sclera
    ctx.fillStyle = isActive ? tb.eyeScleraActive : tb.eyeSclera;
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 4.5, (s * Math.PI) / 8, 0, Math.PI * 2);
    ctx.fill();

    // Outer eye rim
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Pupil
    ctx.fillStyle = isActive ? tb.eyePupilActive : tb.eyePupil;
    ctx.beginPath();
    const pw = isActive ? 2.8 : 1.7;
    const ph = isActive ? 4.2 : 3.8;
    ctx.ellipse(0.5, 0, pw, ph, 0, 0, Math.PI * 2);
    ctx.fill();

    // Specular eye glint sparkle
    if (!isBlinking) {
      const glintPulse = 0.75 + 0.25 * Math.sin(time * 5 + idx);
      ctx.fillStyle = `rgba(255, 255, 255, ${glintPulse})`;
      ctx.beginPath();
      ctx.arc(-0.5, -1.5, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // 9. Nostrils
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.beginPath();
  ctx.arc(22, -3.5, 1.2, 0, Math.PI * 2);
  ctx.arc(22, 3.5, 1.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function drawAnimatedSnakes(
  ctx: CanvasRenderingContext2D,
  time: number,
  activeSnakeHead?: number,
  theme: BoardTheme = THEMES.jungle,
  ampScale = 1,
) {
  const snakeHeads = Object.keys(SNAKES).map(Number);
  snakeHeads.forEach((head, idx) => {
    const tail = SNAKES[head];
    const isActive = activeSnakeHead === head;
    drawAnimatedSnake(ctx, head, tail, idx, time, isActive, theme, ampScale);
  });
}

/**
 * Draws the square-100 finish podium.
 *
 * (F3) `fs` scales only the *text* so labels stay legible on large boards
 * without moving any of the geometry.
 */
export function drawSquare100Podium(
  ctx: CanvasRenderingContext2D,
  c: Pt,
  x: number,
  y: number,
  theme: BoardTheme = THEMES.jungle,
  fs = 1,
) {
  const tb = theme.board;
  ctx.save();

  // 1. Radiant Base
  const bg = ctx.createRadialGradient(c.x, c.y, 4, c.x, c.y, 72);
  bg.addColorStop(0, tb.podiumBgGrad[0]);
  bg.addColorStop(0.25, tb.podiumBgGrad[1]);
  bg.addColorStop(0.65, tb.podiumBgGrad[2]);
  bg.addColorStop(1, tb.podiumBgGrad[3]);
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, CELL, CELL);

  // 2. Translucent Sunburst Rays
  ctx.save();
  ctx.translate(c.x, c.y);
  for (let i = 0; i < 8; i++) {
    const a1 = (i * Math.PI) / 4 - 0.14;
    const a2 = (i * Math.PI) / 4 + 0.14;
    ctx.fillStyle = tb.podiumSunburst;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 70, a1, a2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // 3. Ornate Double Inlay Border
  ctx.strokeStyle = tb.cornerColors[0];
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 3, y + 3, CELL - 6, CELL - 6);

  ctx.strokeStyle = tb.cornerColors[1];
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 5.5, y + 5.5, CELL - 11, CELL - 11);

  // 4. Corner Screws / Rivets
  for (const [rx, ry] of [
    [x + 8, y + 8],
    [x + CELL - 8, y + 8],
    [x + 8, y + CELL - 8],
    [x + CELL - 8, y + CELL - 8],
  ]) {
    ctx.fillStyle = tb.cornerColors[0];
    ctx.beginPath();
    ctx.arc(rx, ry, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // 5. 3D Golden/Holographic Victory Trophy in Center
  const tx = c.x;
  const ty = c.y - 7;

  // Trophy outer aura
  const aura = ctx.createRadialGradient(tx, ty, 2, tx, ty, 30);
  aura.addColorStop(0, tb.podiumAura);
  aura.addColorStop(0.5, `${tb.cornerColors[1]}44`);
  aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(tx, ty, 28, 0, Math.PI * 2);
  ctx.fill();

  // Trophy handles
  ctx.strokeStyle = tb.podiumCupColors[0];
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(tx - 16, ty - 2, 8, Math.PI * 0.4, Math.PI * 1.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(tx + 16, ty - 2, 8, -Math.PI * 0.6, Math.PI * 0.6);
  ctx.stroke();

  ctx.strokeStyle = tb.podiumCupColors[1];
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(tx - 16, ty - 2, 8, Math.PI * 0.4, Math.PI * 1.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(tx + 16, ty - 2, 8, -Math.PI * 0.6, Math.PI * 0.6);
  ctx.stroke();

  // Trophy pedestal base
  ctx.fillStyle = tb.podiumCupColors[3];
  ctx.fillRect(tx - 13, ty + 15, 26, 4.5);
  ctx.fillStyle = tb.podiumCupColors[2];
  ctx.fillRect(tx - 11, ty + 12, 22, 3);
  ctx.fillStyle = tb.podiumCupColors[1];
  ctx.fillRect(tx - 4, ty + 7, 8, 5);

  // Trophy Cup Body
  ctx.beginPath();
  ctx.moveTo(tx - 15, ty - 12);
  ctx.lineTo(tx + 15, ty - 12);
  ctx.quadraticCurveTo(tx + 14, ty + 7, tx + 4, ty + 8);
  ctx.lineTo(tx - 4, ty + 8);
  ctx.quadraticCurveTo(tx - 14, ty + 7, tx - 15, ty - 12);
  ctx.closePath();

  const cupGrad = ctx.createLinearGradient(tx - 15, 0, tx + 15, 0);
  cupGrad.addColorStop(0, tb.podiumCupColors[0]);
  cupGrad.addColorStop(0.3, tb.podiumCupColors[1]);
  cupGrad.addColorStop(0.65, tb.podiumCupColors[2]);
  cupGrad.addColorStop(1, tb.podiumCupColors[3]);
  ctx.fillStyle = cupGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Embossed star on cup
  drawStar(ctx, tx, ty - 2, 6, '#ffffff');

  // Specular cup lip highlight
  ctx.fillStyle = tb.podiumCupColors[1];
  ctx.beginPath();
  ctx.ellipse(tx, ty - 12, 15, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = tb.podiumCupColors[0];
  ctx.lineWidth = 1;
  ctx.stroke();

  // 6. Top-Left Consistent Number Badge ('100')
  const bw = 32;
  const bh = 18;
  const bx = x + 5;
  const by = y + 5;

  ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1.2;

  ctx.fillStyle = tb.numberBgNormal;
  roundRectPath(ctx, bx, by, bw, bh, 5);
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = tb.numberBorderNormal;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.fillStyle = tb.numberTextNormal;
  ctx.font = `800 ${(12 * fs).toFixed(1)}px "Lilita One", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('100', bx + bw / 2, by + bh / 2 + 0.5);

  // 7. Royal Ribbon Across Bottom
  const rw = CELL - 14;
  const rh = 18;
  const rx = x + 7;
  const ry = y + CELL - 22;

  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1.5;

  const ribbonGrad = ctx.createLinearGradient(0, ry, 0, ry + rh);
  ribbonGrad.addColorStop(0, tb.podiumRibbonGrad[0]);
  ribbonGrad.addColorStop(0.5, tb.podiumRibbonGrad[1]);
  ribbonGrad.addColorStop(1, tb.podiumRibbonGrad[2]);
  ctx.fillStyle = ribbonGrad;
  roundRectPath(ctx, rx, ry, rw, rh, 5);
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = tb.numberBorderNormal;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = `900 ${(11 * fs).toFixed(1)}px "Lilita One", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(tb.podiumRibbonText, rx + rw / 2, ry + rh / 2 + 0.5);

  ctx.restore();
}

/**
 * Draws everything that only changes on resize / theme change.
 *
 * @param fs (F3) text scale factor. Only font sizes are multiplied, so the
 *   board's geometry is untouched; clamped to a small range so a very large
 *   desktop board gets slightly bigger labels without a visible jump.
 */
export function drawStaticBoard(
  ctx: CanvasRenderingContext2D,
  theme: BoardTheme = THEMES.jungle,
  players?: PlayerConfig[],
  fs = 1,
) {
  const rnd = mulberry32(20240601);
  const tb = theme.board;

  /* outer frame gradient */
  const wg = ctx.createLinearGradient(0, 0, LOGICAL, LOGICAL);
  wg.addColorStop(0, tb.frameGrad[0]);
  wg.addColorStop(0.3, tb.frameGrad[1]);
  wg.addColorStop(0.7, tb.frameGrad[2]);
  wg.addColorStop(1, tb.frameGrad[3]);
  ctx.fillStyle = wg;
  ctx.fillRect(0, 0, LOGICAL, LOGICAL);

  // Decorative frame pattern
  if (tb.framePattern === 'wood') {
    ctx.strokeStyle = tb.framePatternColors[0] ?? 'rgba(40, 20, 5, 0.22)';
    for (let i = 0; i < 48; i++) {
      const y = rnd() * LOGICAL;
      ctx.lineWidth = 0.8 + rnd() * 1.6;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= LOGICAL; x += 40) {
        ctx.lineTo(x, y + Math.sin(x * 0.01 + i) * 4 + (rnd() - 0.5) * 3);
      }
      ctx.stroke();
    }
  } else if (tb.framePattern === 'circuits') {
    ctx.strokeStyle = tb.framePatternColors[0] ?? 'rgba(6, 182, 212, 0.28)';
    ctx.fillStyle = tb.framePatternColors[1] ?? 'rgba(236, 72, 153, 0.5)';
    for (let i = 0; i < 32; i++) {
      const y = (i / 32) * LOGICAL;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(ORIGIN - 10, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(LOGICAL - (ORIGIN - 10), y);
      ctx.lineTo(LOGICAL, y);
      ctx.stroke();
      if (i % 3 === 0) {
        ctx.fillRect(ORIGIN - 15, y - 2, 4, 4);
        ctx.fillRect(LOGICAL - ORIGIN + 11, y - 2, 4, 4);
      }
    }
  } else if (tb.framePattern === 'sandstone') {
    ctx.strokeStyle = tb.framePatternColors[0] ?? 'rgba(245, 158, 11, 0.18)';
    for (let i = 0; i < 40; i++) {
      const y = rnd() * LOGICAL;
      ctx.lineWidth = 1 + rnd() * 1.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= LOGICAL; x += 60) {
        ctx.lineTo(x, y + (rnd() - 0.5) * 2.5);
      }
      ctx.stroke();
    }
  } else if (tb.framePattern === 'stars') {
    const [c1, c2, c3] = tb.framePatternColors;
    for (let i = 0; i < 60; i++) {
      const sx = rnd() * LOGICAL;
      const sy = rnd() * LOGICAL;
      const sr = 0.8 + rnd() * 1.8;
      ctx.fillStyle = i % 4 === 0 ? c1 : i % 3 === 0 ? c2 : c3;
      ctx.globalAlpha = 0.3 + rnd() * 0.5;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (tb.framePattern === 'frosting') {
    const sprinkles = tb.framePatternColors;
    for (let i = 0; i < 45; i++) {
      const sx = rnd() * LOGICAL;
      const sy = rnd() * LOGICAL;
      ctx.fillStyle = sprinkles[i % sprinkles.length];
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(rnd() * Math.PI);
      ctx.fillRect(-4, -1.5, 8, 3);
      ctx.restore();
    }
  }

  /* inner bezel border */
  ctx.strokeStyle = tb.bezelOuter;
  ctx.lineWidth = 10;
  ctx.strokeRect(ORIGIN - 6, ORIGIN - 6, LOGICAL - (ORIGIN - 6) * 2, LOGICAL - (ORIGIN - 6) * 2);

  ctx.strokeStyle = tb.bezelInner;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(ORIGIN - 13, ORIGIN - 13, LOGICAL - (ORIGIN - 13) * 2, LOGICAL - (ORIGIN - 13) * 2);

  /* ornate corner brackets */
  const corners = [
    [24, 24],
    [LOGICAL - 24, 24],
    [24, LOGICAL - 24],
    [LOGICAL - 24, LOGICAL - 24],
  ];

  for (const [cx, cy] of corners) {
    if (tb.cornerType === 'cyber') {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.beginPath();
      for (let s = 0; s < 6; s++) {
        const a = (s * Math.PI) / 3;
        const hx = Math.cos(a) * 13;
        const hy = Math.sin(a) * 13;
        if (s === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.fillStyle = tb.cornerColors[2];
      ctx.fill();
      ctx.strokeStyle = tb.cornerColors[1];
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.fillStyle = tb.cornerColors[0];
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (tb.cornerType === 'peppermint') {
      ctx.save();
      ctx.translate(cx, cy);
      for (let w = 0; w < 8; w++) {
        ctx.fillStyle = w % 2 === 0 ? tb.cornerColors[0] : tb.cornerColors[1];
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 12, (w * Math.PI) / 4, ((w + 1) * Math.PI) / 4);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = tb.cornerColors[2];
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (tb.cornerType === 'pharaoh') {
      const g = ctx.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, 13);
      g.addColorStop(0, tb.cornerColors[0]);
      g.addColorStop(0.6, tb.cornerColors[1]);
      g.addColorStop(1, tb.cornerGroove);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = tb.cornerColors[2];
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = tb.cornerColors[2];
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (tb.cornerType === 'astral') {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = tb.cornerColors[2];
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = tb.cornerColors[1];
      ctx.lineWidth = 1.5;
      ctx.stroke();
      drawStar(ctx, 0, 0, 8, tb.cornerColors[0]);
      ctx.restore();
    } else {
      const g = ctx.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, 12);
      g.addColorStop(0, tb.cornerColors[0]);
      g.addColorStop(0.6, tb.cornerColors[1]);
      g.addColorStop(1, tb.cornerColors[2]);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      ctx.strokeStyle = tb.cornerGroove;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy);
      ctx.lineTo(cx + 5, cy);
      ctx.stroke();
    }
  }

  /* (B4) Progress notches on the frame at the quarter bands.
     Squares 1 and 100 both sit in the leftmost column, so the boustrophedon
     numbering is genuinely hard to read at a glance. These little marks live
     on the frame - they never intrude on the play area - and give the eye an
     instant read of "how far along the race am I". */
  /* (J3) ...and now they are *labelled*. The three interior bands sit at 75% /
     50% / 25% of the way up the board (square 100 is at the top-left, so the
     top quarter band is the 75% mark - hence counting down from the top), which
     turns the notches into a readable progress ruler. The 4th band is the
     bottom edge of the play area, i.e. the start line, so it stays unlabelled
     rather than implying a square number. Drawn in the cached layer only, and
     engraved (dark offset + light face) so it reads as part of the frame. */
  const boardTop = ORIGIN;
  const boardBottom = LOGICAL - ORIGIN;
  for (let band = 1; band <= 4; band++) {
    const y = boardTop + ((boardBottom - boardTop) * band) / 4;
    // Two notches, one on each vertical frame rail, plus a hairline across the
    // frame lip so the alignment is readable at a glance.
    for (const x of [ORIGIN / 2, LOGICAL - ORIGIN / 2]) {
      ctx.fillStyle = tb.guideNotch;
      ctx.fillRect(x - 1.5, y - 7, 3, 14);
    }
    ctx.fillStyle = tb.guideNotch;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(ORIGIN - 6, y - 0.75, 6, 1.5);
    ctx.fillRect(LOGICAL - ORIGIN, y - 0.75, 6, 1.5);
    ctx.globalAlpha = 1;

    // (J3) Engraved percentage on the left frame rail, just inboard of its
    // notch. Only the three interior bands are labelled.
    if (band <= 3) {
      ctx.save();
      ctx.font = `800 ${(9.5 * fs).toFixed(1)}px "Lilita One", sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 3;
      ctx.shadowOffsetY = 1;
      ctx.fillStyle = tb.numberTextNormal;
      ctx.fillText(`${100 - band * 25}`, ORIGIN / 2 - 4, y + 0.5);
      ctx.restore();
    }
  }

  /* 1. Square Backgrounds & Borders */
  // Deterministic per-tile grain offsets. Precomputed once so the 3.5% grain
  // overlay is stable across re-renders instead of shimmering on every resize.
  const grainSeed = mulberry32(770077);
  const grainOffsets: number[] = [];
  for (let i = 0; i < 40; i++) grainOffsets.push(grainSeed());

  for (let n = 1; n <= 100; n++) {
    const c = squareCenter(n);
    const x = c.x - CELL / 2;
    const y = c.y - CELL / 2;
    const i = n - 1;
    const r = Math.floor(i / 10);
    const col = r % 2 === 0 ? i % 10 : 9 - (i % 10);
    const dark = (r + col) % 2 === 0;

    // (C2) Square 100 used to get its own radial gradient here, which
    // drawSquare100Podium then completely overpaints. Pure wasted work in the
    // cached layer - tile 100 is now simply left to the podium painter.
    if (n !== 100) {
      ctx.fillStyle = dark ? tb.tileDark : tb.tileLight;
      ctx.fillRect(x, y, CELL, CELL);
    }

    // Inner tile sheen
    if (n !== 100) {
      const g = ctx.createLinearGradient(0, y, 0, y + CELL);
      g.addColorStop(0, tb.tileSheen);
      g.addColorStop(0.4, 'rgba(255, 255, 255, 0)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0.22)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, CELL, CELL);
    }

    // (B2) Very fine grain so large flat fills stop looking like plastic.
    // Kept at a few percent so it reads as material texture, never as pattern.
    if (tb.tileGrain > 0 && n !== 100) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, CELL, CELL);
      ctx.clip();
      ctx.fillStyle = tb.tileGrain > 0.05 ? '#ffffff' : '#000000';
      const dots = 16;
      for (let d = 0; d < dots; d++) {
        const gx = x + grainOffsets[(n * 3 + d) % grainOffsets.length] * CELL;
        const gy = y + grainOffsets[(n * 7 + d * 3) % grainOffsets.length] * CELL;
        const gs = 0.8 + grainOffsets[(n + d * 5) % grainOffsets.length] * 1.4;
        ctx.globalAlpha = grainOffsets[(n * 11 + d) % grainOffsets.length] * 0.055;
        ctx.fillRect(gx, gy, gs, gs);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // Tile border
    ctx.strokeStyle = tb.tileBorder;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.75, y + 0.75, CELL - 1.5, CELL - 1.5);
  }

  /* (C4) Inner shadow around the play area so the grid reads as recessed into
     the frame. Drawn after the tiles but before the ladders, so ladders and
     snakes keep their full contrast. */
  const vg = ctx.createLinearGradient(ORIGIN, ORIGIN, ORIGIN, ORIGIN + CELL * 0.22);
  vg.addColorStop(0, tb.vignette);
  vg.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = vg;
  ctx.fillRect(ORIGIN, ORIGIN, CELL * 10, CELL * 0.22);
  const vgBottom = ctx.createLinearGradient(ORIGIN, ORIGIN + CELL * 10, ORIGIN, ORIGIN + CELL * 10 - CELL * 0.22);
  vgBottom.addColorStop(0, tb.vignette);
  vgBottom.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = vgBottom;
  ctx.fillRect(ORIGIN, ORIGIN + CELL * 10 - CELL * 0.22, CELL * 10, CELL * 0.22);
  const vgLeft = ctx.createLinearGradient(ORIGIN, ORIGIN, ORIGIN + CELL * 0.18, ORIGIN);
  vgLeft.addColorStop(0, tb.vignette);
  vgLeft.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = vgLeft;
  ctx.fillRect(ORIGIN, ORIGIN, CELL * 0.18, CELL * 10);
  const vgRight = ctx.createLinearGradient(ORIGIN + CELL * 10, ORIGIN, ORIGIN + CELL * 10 - CELL * 0.18, ORIGIN);
  vgRight.addColorStop(0, tb.vignette);
  vgRight.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = vgRight;
  ctx.fillRect(ORIGIN + CELL * 10 - CELL * 0.18, ORIGIN, CELL * 0.18, CELL * 10);

  /* 2. Ladders */
  for (const b of Object.keys(LADDERS)) {
    const bn = Number(b);
    drawLadder(ctx, bn, LADDERS[bn], theme);
  }

  /* 3. START Bay on bottom border (Square 0) */
  ctx.save();
  const bayX = 46;
  const bayY = 998;
  const bayW = 340;
  const bayH = 38;

  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;

  const bayGrad = ctx.createLinearGradient(0, bayY, 0, bayY + bayH);
  bayGrad.addColorStop(0, tb.startBayBgGrad[0]);
  bayGrad.addColorStop(0.5, tb.startBayBgGrad[1]);
  bayGrad.addColorStop(1, tb.startBayBgGrad[2]);
  ctx.fillStyle = bayGrad;
  roundRectPath(ctx, bayX, bayY, bayW, bayH, 8);
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = tb.startBayBorder;
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Left Section: Dedicated Title Plaque
  const titleX = bayX + 4;
  const titleY = bayY + 4;
  const titleW = 104;
  const titleH = 30;

  ctx.fillStyle = tb.startBayTitleBg;
  roundRectPath(ctx, titleX, titleY, titleW, titleH, 6);
  ctx.fill();
  ctx.strokeStyle = tb.startBayBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = tb.startBayTitleText;
  ctx.font = `900 ${(12.5 * fs).toFixed(1)}px "Lilita One", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(tb.startBayTitle, titleX + titleW / 2, titleY + 15);

  ctx.fillStyle = tb.startBaySubText;
  ctx.font = `800 ${(9 * fs).toFixed(1)}px "Nunito", sans-serif`;
  ctx.fillText(tb.startBaySub, titleX + titleW / 2, titleY + 26);

  // Divider groove
  ctx.strokeStyle = tb.startBayBorder;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(bayX + 116, bayY + 6);
  ctx.lineTo(bayX + 116, bayY + bayH - 6);
  ctx.stroke();

  // 4 Recessed Docking Dishes using selected player colors
  START_POS.forEach((pt, idx) => {
    const player = players?.[idx];
    const colorId = player !== undefined ? player.colorId : idx;
    const col = PLAYER_COLORS[colorId % PLAYER_COLORS.length];
    const sockGrad = ctx.createRadialGradient(pt.x, pt.y - 1, 2, pt.x, pt.y, 16);
    sockGrad.addColorStop(0, tb.startBayDockGrad[0]);
    sockGrad.addColorStop(0.7, tb.startBayDockGrad[1]);
    sockGrad.addColorStop(1, tb.startBayDockGrad[2]);
    ctx.fillStyle = sockGrad;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 15, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = col.base;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.font = `900 ${(10 * fs).toFixed(1)}px "Lilita One", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`P${idx + 1}`, pt.x, pt.y + 0.5);
  });

  // (F4) Navigation arrow - drawn, not typeset. The old code printed "\u2794"
  // with "Lilita One", which has no such glyph, so every platform rendered a
  // different fallback arrow.
  drawChevron(ctx, bayX + bayW - 12, bayY + bayH / 2, 7, tb.startBayTitleText);

  ctx.restore();
}

export function drawBoardBadgesAndNumbers(
  ctx: CanvasRenderingContext2D,
  theme: BoardTheme = THEMES.jungle,
  fs = 1,
) {
  const tb = theme.board;

  /* 1. Badges on Snake heads & Ladder bottoms */
  for (const [fromStr, portal] of Object.entries(PORTALS)) {
    const from = Number(fromStr);
    const c = squareCenter(from);
    const x = c.x - CELL / 2;
    const y = c.y - CELL / 2;

    ctx.save();
    const bx = x + CELL - 34;
    const by = y + CELL - 22;
    if (portal.type === 'ladder') {
      ctx.fillStyle = tb.badgeLadderBg;
      roundRectPath(ctx, bx, by, 30, 18, 6);
      ctx.fill();
      ctx.strokeStyle = tb.badgeLadderBorder;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // (F4) Triangle drawn as a path instead of typed as "\u25B2" so it can
      // never fall back to an arbitrary system font.
      drawTriUp(ctx, bx + 8, by + 9, 5, tb.badgeLadderText);
      ctx.fillStyle = tb.badgeLadderText;
      ctx.font = `900 ${(11 * fs).toFixed(1)}px "Nunito", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(portal.to), bx + 20, by + 9.5);
    } else {
      ctx.fillStyle = tb.badgeSnakeBg;
      roundRectPath(ctx, bx, by, 30, 18, 6);
      ctx.fill();
      ctx.strokeStyle = tb.badgeSnakeBorder;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      drawTriDown(ctx, bx + 8, by + 9, 5, tb.badgeSnakeText);
      ctx.fillStyle = tb.badgeSnakeText;
      ctx.font = `900 ${(11 * fs).toFixed(1)}px "Nunito", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(portal.to), bx + 20, by + 9.5);
    }
    ctx.restore();
  }

  /* 2. Cell Numbers (1 to 100) */
  for (let n = 1; n <= 100; n++) {
    const c = squareCenter(n);
    const x = c.x - CELL / 2;
    const y = c.y - CELL / 2;

    if (n === 100) {
      drawSquare100Podium(ctx, c, x, y, theme, fs);
      continue;
    }

    const hasSnake = n in SNAKES;
    const hasLadder = n in LADDERS;

    const text = String(n);
    const isSingle = n < 10;
    const bw = isSingle ? 23 : 28;
    const bh = 18;
    const bx = x + 5;
    const by = y + 5;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1.2;

    if (hasSnake) {
      ctx.fillStyle = tb.numberBgSnake;
    } else if (hasLadder) {
      ctx.fillStyle = tb.numberBgLadder;
    } else {
      ctx.fillStyle = tb.numberBgNormal;
    }

    roundRectPath(ctx, bx, by, bw, bh, 5);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = hasSnake
      ? tb.numberBorderSnake
      : hasLadder
        ? tb.numberBorderLadder
        : tb.numberBorderNormal;
    ctx.lineWidth = 1;
    ctx.stroke();

    // (B3) A hairline top highlight. The badge sits on top of animated snakes,
    // so without a lit edge the numbers visually sink into the artwork. The
    // geometry and colours of the badge are otherwise untouched.
    ctx.save();
    roundRectPath(ctx, bx, by, bw, bh, 5);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bx + 1, by + 0.5);
    ctx.lineTo(bx + bw - 1, by + 0.5);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = hasSnake
      ? tb.numberTextSnake
      : hasLadder
        ? tb.numberTextLadder
        : tb.numberTextNormal;
    ctx.font = `800 ${(12.5 * fs).toFixed(1)}px "Lilita One", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + bw / 2, by + bh / 2 + 0.5);

    ctx.restore();
  }
}

/* ---------------- tokens ---------------- */

export interface TokenOpts {
  /** 0..1 hop progress, used to lift the ground shadow. */
  hopRatio?: number;
  /**
   * (D3) Draws the rotating "this is you" halo. Only set for the active
   * player's token, so the board always answers "whose turn is it?".
   */
  turnRingTime?: number;
  /**
   * (D4) Soft player-coloured glow behind the inner number badge. Gives the
   * active token extra emphasis without altering its shape or colours.
   */
  badgeGlow?: string;
  /**
   * (D5) Cast shadow colour, matching the light direction already used by the
   * snakes and ladders (light from the top-left).
   */
  castShadow?: string;
}

export function drawToken(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  colors: { base: string; light: string; dark: string },
  label: string,
  opts: TokenOpts = {},
) {
  const hopRatio = opts.hopRatio ?? 0;
  ctx.save();

  // (D5) Cast shadow, consistent with the snakes/ladders light direction.
  if (opts.castShadow) {
    ctx.fillStyle = opts.castShadow;
    ctx.beginPath();
    ctx.ellipse(x + 2.5, y + 3.5, r * 0.98, r * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ground shadow stays fixed beneath the hop trajectory
  const shadowY = y + hopRatio * 32;
  const shadowRadius = r * (0.95 - hopRatio * 0.3);
  const shadowOpacity = 0.45 * (1 - hopRatio * 0.5);

  ctx.fillStyle = `rgba(0, 0, 0, ${shadowOpacity})`;
  ctx.beginPath();
  ctx.ellipse(x, shadowY + r * 0.85, shadowRadius, r * (0.4 - hopRatio * 0.15), 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(x, y);

  // 3D Sphere gradient
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.15, 0, 0, r * 1.25);
  g.addColorStop(0, colors.light);
  g.addColorStop(0.45, colors.base);
  g.addColorStop(1, colors.dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  // Polished rim
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Inner badge center with player number
  if (opts.badgeGlow) {
    // (D4) A coloured bloom behind the white disc lifts the active token out
    // of the board art without changing the token's shape or palette.
    ctx.save();
    ctx.shadowColor = opts.badgeGlow;
    ctx.shadowBlur = r * 0.5;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.beginPath();
    ctx.arc(0, 1, r * 0.52, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.beginPath();
    ctx.arc(0, 1, r * 0.52, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = colors.dark;
  ctx.font = `900 ${Math.round(r * 0.72)}px "Lilita One", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, r * 0.08);

  // Specular reflection highlight
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.32, -r * 0.44, r * 0.35, r * 0.22, -0.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/* Target Destination Ring Highlight */
export function drawTargetHighlight(
  ctx: CanvasRenderingContext2D,
  targetSquare: number,
  color: string,
  time: number,
) {
  if (targetSquare <= 0 || targetSquare > 100) return;
  const c = squareCenter(targetSquare);
  const pulse = 0.5 + 0.3 * Math.sin(time * 6);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = pulse;
  ctx.lineWidth = 4;
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  roundRectPath(ctx, c.x - CELL / 2 + 5, c.y - CELL / 2 + 5, CELL - 10, CELL - 10, 12);
  ctx.stroke();

  // Golden beacon center dot
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* Hovered cell border highlight - (A4) colour now comes from the theme, so it
   no longer shows jungle amber while playing Candy/Cosmic/Cyber/Desert. */
export function drawHoverHighlight(
  ctx: CanvasRenderingContext2D,
  square: number,
  time: number,
  theme: BoardTheme = THEMES.jungle,
) {
  if (square <= 0 || square > 100) return;
  const c = squareCenter(square);
  const x = c.x - CELL / 2;
  const y = c.y - CELL / 2;

  ctx.save();
  const pulse = 0.55 + 0.25 * Math.sin(time * 7);
  ctx.strokeStyle = theme.board.hoverRing;
  ctx.globalAlpha = pulse;
  ctx.lineWidth = 2.5;
  ctx.shadowColor = theme.board.hoverRingGlow;
  ctx.shadowBlur = 10;
  roundRectPath(ctx, x + 3, y + 3, CELL - 6, CELL - 6, 8);
  ctx.stroke();
  ctx.restore();
}

/**
 * (B5 / B6) While inspecting a ladder or snake, trace the route the token will
 * take: a marching dashed line for ladders, plus a direction arrow at the
 * destination for both.
 */
export function drawPortalPreview(
  ctx: CanvasRenderingContext2D,
  from: number,
  to: number,
  time: number,
  theme: BoardTheme = THEMES.jungle,
) {
  const portal = PORTALS[from];
  if (!portal) return;
  const tb = theme.board;
  const a = squareCenter(from);
  const c = squareCenter(to);
  const isLadder = portal.type === 'ladder';
  const color = isLadder ? tb.badgeLadderBorder : tb.badgeSnakeBorder;
  const glow = isLadder ? tb.badgeLadderText : tb.badgeSnakeText;

  // Ladders are drawn between their two rails, so the preview follows suit.
  let ax = a.x;
  let ay = a.y;
  if (isLadder) {
    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    ax += (-dy / len) * 13;
    ay += (dx / len) * 13;
  }

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.setLineDash([9, 11]);
  ctx.lineDashOffset = -time * 42;
  ctx.globalAlpha = 0.7;
  ctx.shadowColor = glow;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(c.x, c.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Direction arrow at the destination
  const ang = Math.atan2(c.y - ay, c.x - ax);
  drawArrowHead(
    ctx,
    c.x - Math.cos(ang) * (isLadder ? 10 : 4),
    c.y - Math.sin(ang) * (isLadder ? 10 : 4),
    ang,
    9,
    glow,
  );

  // Destination ring
  ctx.globalAlpha = 0.55 + 0.25 * Math.sin(time * 6);
  ctx.strokeStyle = glow;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(c.x, c.y, CELL * 0.36, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * (E3) A bright pulse running up a ladder's rails while a token climbs, so the
 * climb reads as progress rather than a teleport.
 */
export function drawLadderClimbGlow(
  ctx: CanvasRenderingContext2D,
  from: number,
  to: number,
  progress: number,
  time: number,
  theme: BoardTheme = THEMES.jungle,
) {
  const tb = theme.board;
  const a = squareCenter(from);
  const c = squareCenter(to);
  const dx = c.x - a.x;
  const dy = c.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = (-dy / len) * 13;
  const py = (dx / len) * 13;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = tb.ladderRungHighlight;
  ctx.shadowColor = tb.ladderGlowColor;
  ctx.shadowBlur = 14;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(a.x + px, a.y + py);
  ctx.lineTo(c.x + px, c.y + py);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(a.x - px, a.y - py);
  ctx.lineTo(c.x - px, c.y - py);
  ctx.stroke();

  // Travelling spark at the climber's current position
  const t = clamp(progress, 0, 1);
  ctx.fillStyle = tb.ladderRungHighlight;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(a.x + dx * t, a.y + dy * t, 7 + 3 * Math.sin(time * 14), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * (D3) Rotating dashed halo marking the active player's token.
 */
export function drawTurnRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  time: number,
  color: string,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(time * 0.9);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.55 + 0.25 * Math.sin(time * 4);
  ctx.lineWidth = 2.4;
  ctx.setLineDash([r * 0.42, r * 0.34]);
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.32, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * (D2) Fading player-coloured trail behind a hopping token.
 */
export function drawHopTrail(
  ctx: CanvasRenderingContext2D,
  from: Pt,
  to: Pt,
  f: number,
  color: string,
) {
  if (f <= 0.02) return;
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 1; i <= 5; i++) {
    const t = (f * i) / 6;
    ctx.globalAlpha = 0.3 * (1 - t) * (1 - f * 0.4);
    ctx.beginPath();
    ctx.arc(
      from.x + (to.x - from.x) * t,
      from.y + (to.y - from.y) * t,
      4 + 5 * (1 - t),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}

/**
 * (E2) Screen-edge impact flash on a snake bite. `intensity` is 0..1.
 */
export function drawImpactFlash(
  ctx: CanvasRenderingContext2D,
  intensity: number,
  color: string,
) {
  if (intensity <= 0) return;
  const g = ctx.createRadialGradient(
    LOGICAL / 2,
    LOGICAL / 2,
    LOGICAL * 0.25,
    LOGICAL / 2,
    LOGICAL / 2,
    LOGICAL * 0.78,
  );
  g.addColorStop(0, 'rgba(0, 0, 0, 0)');
  g.addColorStop(1, color);
  ctx.save();
  ctx.globalAlpha = Math.min(1, intensity);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, LOGICAL, LOGICAL);
  ctx.restore();
}

/* ---------------- frame & ambience overlays ---------------- */

/** Maps a perimeter distance to a point on the frame band. */
function framePoint(d: number, band: number): Pt {
  const top = band;
  const bottom = LOGICAL - band;
  let dd = d;
  if (dd < LOGICAL) return { x: dd, y: top };
  if ((dd -= LOGICAL) < band * 2) return { x: LOGICAL, y: top + dd };
  if ((dd -= band * 2) < LOGICAL) return { x: LOGICAL - dd, y: bottom };
  dd -= LOGICAL;
  return { x: 0, y: bottom - dd };
}

/**
 * (C5) Drifting ambient motes, clipped to the *frame* only so they can never
 * obscure a square, a snake or a token. This is what makes each theme feel
 * alive without hurting readability.
 */
export function drawAmbientMotes(
  ctx: CanvasRenderingContext2D,
  time: number,
  theme: BoardTheme = THEMES.jungle,
) {
  const m = theme.board.ambientMote;
  if (!m || m.count <= 0) return;
  const band = ORIGIN - 4; // usable frame thickness on each side
  const perimeter = 2 * (LOGICAL + band * 2);
  ctx.save();
  ctx.fillStyle = m.color;
  for (let i = 0; i < m.count; i++) {
    // Deterministic per-mote randomness so nothing jumps on a theme change.
    const s1 = mulberry32(9001 + i * 137)();
    const s2 = mulberry32(4242 + i * 311)();
    const s3 = mulberry32(777 + i * 53)();

    const p = (s1 + time * m.speed * (0.5 + s3)) % 1;
    const pt = framePoint(p * perimeter, band);
    const x = pt.x + (s2 - 0.5) * (band - 6);
    const y = pt.y + (s3 - 0.5) * (band - 6);

    const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * (1.4 + s1 * 2.2) + s2 * 6.283));
    ctx.globalAlpha = m.alpha * tw;
    ctx.beginPath();
    ctx.arc(x, y, m.size * (0.7 + tw * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * (E6) A very slow light sweep travelling around the bezel, so a waiting board
 * never looks frozen. Confined to the frame.
 */
export function drawFrameSweep(
  ctx: CanvasRenderingContext2D,
  time: number,
  theme: BoardTheme = THEMES.jungle,
) {
  const accent = theme.ui.accent;
  const band = ORIGIN - 4;
  const perimeter = LOGICAL * 4;
  const start = ((time % 9) / 9) * perimeter;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = accent;
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.1;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 18;
  ctx.beginPath();
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const pt = framePoint((start + (i / steps) * 190) % perimeter, band);
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * (D6) A thin player-coloured lip just inside the frame, tying the active
 * player to the board itself.
 */
export function drawActivePlayerEdge(ctx: CanvasRenderingContext2D, color: string, time: number) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.3 + 0.2 * Math.sin(time * 2.4);
  ctx.lineWidth = 3;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  roundRectPath(
    ctx,
    ORIGIN - 8,
    ORIGIN - 8,
    LOGICAL - (ORIGIN - 8) * 2,
    LOGICAL - (ORIGIN - 8) * 2,
    10,
  );
  ctx.stroke();
  ctx.restore();
}

/**
 * (C1 / C7) Winner halo plus a slow expanding ripple over the finish square.
 * Per-frame, so it can react to a token actually standing there.
 *
 * (J5) `animateRipple = false` freezes the beacon for `prefers-reduced-motion`
 * users: the ripple is decoration, while the occupant pool below it is a real
 * "someone is standing on the podium" cue and is always drawn.
 */
export function drawPodiumPresence(
  ctx: CanvasRenderingContext2D,
  time: number,
  occupiedBy: string | null,
  theme: BoardTheme = THEMES.jungle,
  animateRipple = true,
) {
  const c = squareCenter(100);
  ctx.save();

  // (C7) Ripple
  if (animateRipple) {
    for (let i = 0; i < 2; i++) {
      const t = (time * 0.42 + i * 0.5) % 1;
      ctx.globalAlpha = (1 - t) * 0.3;
      ctx.strokeStyle = theme.ui.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 14 + t * 34, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // (C1) A token parked on the finish square draws straight over the trophy.
  // A soft player-coloured pool underneath keeps it reading as "standing on
  // the podium" instead of colliding with the artwork.
  if (occupiedBy) {
    const g = ctx.createRadialGradient(c.x, c.y, 4, c.x, c.y, 40);
    g.addColorStop(0, occupiedBy);
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.globalAlpha = 0.32 + 0.12 * Math.sin(time * 4);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 40, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * (C6) Corner studs breathe gently in the active player's colour, tying the
 * four corners of the frame to whoever is playing.
 */
export function drawCornerPulse(
  ctx: CanvasRenderingContext2D,
  time: number,
  color: string,
  enabled: boolean,
) {
  if (!enabled) return;
  ctx.save();
  ctx.globalAlpha = 0.25 + 0.2 * Math.sin(time * 3);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  for (const [cx, cy] of [
    [24, 24],
    [LOGICAL - 24, 24],
    [24, LOGICAL - 24],
    [LOGICAL - 24, LOGICAL - 24],
  ]) {
    ctx.beginPath();
    ctx.arc(cx, cy, 15, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

