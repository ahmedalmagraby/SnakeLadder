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
  snakeColor,
  squareCenter,
} from './constants';

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
  kind: 'dust' | 'spark' | 'confetti' | 'firework';
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

export function spawnDust(ps: Particle[], x: number, y: number) {
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
      color: '#a7f3d0',
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

export function spawnConfetti(ps: Particle[]) {
  const colors = ['#fbbf24', '#22d3ee', '#f43f5e', '#a3e635', '#ffffff', '#fb923c', '#e879f9'];
  for (let i = 0; i < 80; i++) {
    ps.push({
      x: Math.random() * LOGICAL,
      y: -20 - Math.random() * 80,
      vx: (Math.random() - 0.5) * 110,
      vy: 70 + Math.random() * 140,
      life: 3.2 + Math.random() * 2.8,
      maxLife: 6.0,
      size: 6 + Math.random() * 7,
      color: colors[(Math.random() * colors.length) | 0],
      kind: 'confetti',
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 10,
      g: 50,
    });
  }
}

export function spawnFirework(ps: Particle[], cx: number, cy: number) {
  const colors = ['#fde047', '#38bdf8', '#fb7185', '#4ade80', '#c084fc'];
  const burstColor = colors[(Math.random() * colors.length) | 0];
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

function drawLadder(ctx: CanvasRenderingContext2D, b: number, t: number) {
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

  // Outer dark shadow
  ctx.strokeStyle = 'rgba(25, 12, 4, 0.75)';
  ctx.lineWidth = 12;
  rail(px + 2, py + 3);
  rail(-px + 2, -py + 3);

  // Wooden rail core
  ctx.strokeStyle = '#4a2508';
  ctx.lineWidth = 10;
  rail(px, py);
  rail(-px, -py);

  // Golden polish highlight
  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 6;
  rail(px, py);
  rail(-px, -py);

  ctx.strokeStyle = 'rgba(254, 240, 138, 0.7)';
  ctx.lineWidth = 2;
  rail(px - 1.2, py - 1.2);
  rail(-px - 1.2, -py - 1.2);

  // Rungs
  const count = Math.max(3, Math.floor(len / 38));
  for (let i = 1; i <= count; i++) {
    const f = i / (count + 1);
    const x = a.x + dx * f;
    const y = a.y + dy * f;

    // Rung shadow
    ctx.strokeStyle = 'rgba(25, 12, 4, 0.75)';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(x + px + 1, y + py + 2);
    ctx.lineTo(x - px + 1, y - py + 2);
    ctx.stroke();

    // Rung wood
    ctx.strokeStyle = '#4a2508';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(x + px, y + py);
    ctx.lineTo(x - px, y - py);
    ctx.stroke();

    // Rung gold/brass
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(x + px, y + py);
    ctx.lineTo(x - px, y - py);
    ctx.stroke();

    // Rung rivet dots at rail connection
    ctx.fillStyle = '#fef08a';
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
) {
  const [main, dark] = snakeColor(idx);
  const a = squareCenter(headNum);
  const b = squareCenter(tailNum);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const nx = dx / len;
  const ny = dy / len;

  // Stable procedural wave parameters based on head square
  const rnd = mulberry32(headNum * 31 + 7);
  const baseAmp = 10 + rnd() * 12;
  const amp = isActive ? baseAmp * 1.3 : baseAmp;
  const waves = 1.4 + rnd() * 1.1;
  const phase = rnd() * Math.PI * 2;
  const speed = isActive ? 5.5 : 2.2 + (idx % 3) * 0.45;

  // Breathing oscillation
  const breathe = isActive
    ? Math.sin(time * 7.5) * 2.2
    : Math.sin(time * 2.4 + phase) * 1.2;

  // Head micro-lunge or idle swaying motion
  const headBob = isActive
    ? Math.sin(time * 16) * 4.2
    : Math.sin(time * 2.6 + phase) * 1.6;

  // Generate dynamic undulating spine points
  const n = Math.max(28, Math.round(len / 5.5));
  const pts: Pt[] = [];

  for (let i = 0; i <= n; i++) {
    const f = i / n;
    // Envelope is 0 at both head and tail so endpoints remain anchored to square centers
    const env = Math.sin(f * Math.PI);
    // Traveling wave equation along the snake's spine
    const wavePhase = f * Math.PI * waves * 2 + phase - time * speed;
    const wob = Math.sin(wavePhase) * amp * env;

    // Small head micro-motion along spine vector
    const bobOffset = headBob * Math.pow(1 - f, 2.5);

    pts.push({
      x: a.x + dx * f + px * wob + nx * bobOffset,
      y: a.y + dy * f + py * wob + ny * bobOffset,
    });
  }

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
    ctx.strokeStyle = 'rgba(2, 12, 8, 0.62)';
    ctx.lineWidth = wAt(i / n) + 5;
    ctx.beginPath();
    ctx.moveTo(pts[i].x + 2.5, pts[i].y + 3.5);
    ctx.lineTo(pts[i + 1].x + 2.5, pts[i + 1].y + 3.5);
    ctx.stroke();
  }

  // 2. Dark outer outline
  for (let i = 0; i < n; i++) {
    seg(i, wAt(i / n) + 4.5, 'rgba(5, 25, 18, 0.95)');
  }

  // 3. Colored body gradient
  for (let i = 0; i < n; i++) {
    seg(i, wAt(i / n), hexLerp(main, dark, i / n));
  }

  // 4. Traveling specular scale diamond shimmer along spine
  for (let i = 1; i < n; i++) {
    const f = i / n;
    const shimmer = Math.sin(f * 14 - time * 3.8 + phase) * 0.5 + 0.5;
    const alpha = 0.12 + shimmer * 0.42;
    seg(i, wAt(f) * 0.45, `rgba(255, 255, 255, ${alpha})`);
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
      ctx.strokeStyle = isActive ? '#ef4444' : '#f43f5e';
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
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 18;
    ctx.fillStyle = `rgba(239, 68, 68, ${auraPulse})`;
    ctx.beginPath();
    ctx.ellipse(8, 0, 28, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Head shadow
  ctx.fillStyle = 'rgba(2, 12, 8, 0.65)';
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

  ctx.strokeStyle = 'rgba(5, 25, 18, 0.95)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Active mouth gaping & fangs
  if (isActive) {
    ctx.fillStyle = '#450a0a';
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

    // Sclera (predatory golden amber or angry red when active)
    ctx.fillStyle = isActive ? '#fee2e2' : '#fef08a';
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 4.5, (s * Math.PI) / 8, 0, Math.PI * 2);
    ctx.fill();

    // Outer eye rim
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Pupil (vertical slit; dilates when striking/active)
    ctx.fillStyle = isActive ? '#ef4444' : '#111827';
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
) {
  const snakeHeads = Object.keys(SNAKES).map(Number);
  snakeHeads.forEach((head, idx) => {
    const tail = SNAKES[head];
    const isActive = activeSnakeHead === head;
    drawAnimatedSnake(ctx, head, tail, idx, time, isActive);
  });
}

export function drawSquare100Podium(
  ctx: CanvasRenderingContext2D,
  c: Pt,
  x: number,
  y: number,
) {
  ctx.save();

  // 1. Radiant Sunburst Golden Base
  const bg = ctx.createRadialGradient(c.x, c.y, 4, c.x, c.y, 72);
  bg.addColorStop(0, '#fffbeb');
  bg.addColorStop(0.25, '#fde047');
  bg.addColorStop(0.65, '#d97706');
  bg.addColorStop(1, '#78350f');
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, CELL, CELL);

  // 2. Translucent Sunburst Rays
  ctx.save();
  ctx.translate(c.x, c.y);
  for (let i = 0; i < 8; i++) {
    const a1 = (i * Math.PI) / 4 - 0.14;
    const a2 = (i * Math.PI) / 4 + 0.14;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 70, a1, a2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // 3. Ornate Double Golden Inlay Border
  ctx.strokeStyle = 'rgba(254, 240, 138, 0.75)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 3, y + 3, CELL - 6, CELL - 6);

  ctx.strokeStyle = 'rgba(120, 53, 15, 0.6)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 5.5, y + 5.5, CELL - 11, CELL - 11);

  // 4. Corner Golden Screws / Rivets
  for (const [rx, ry] of [
    [x + 8, y + 8],
    [x + CELL - 8, y + 8],
    [x + 8, y + CELL - 8],
    [x + CELL - 8, y + CELL - 8],
  ]) {
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(rx, ry, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // 5. 3D Golden Victory Trophy in Center
  const tx = c.x;
  const ty = c.y - 7;

  // Trophy outer golden aura
  const aura = ctx.createRadialGradient(tx, ty, 2, tx, ty, 30);
  aura.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
  aura.addColorStop(0.5, 'rgba(253, 224, 71, 0.3)');
  aura.addColorStop(1, 'rgba(253, 224, 71, 0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(tx, ty, 28, 0, Math.PI * 2);
  ctx.fill();

  // Trophy handles
  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(tx - 16, ty - 2, 8, Math.PI * 0.4, Math.PI * 1.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(tx + 16, ty - 2, 8, -Math.PI * 0.6, Math.PI * 0.6);
  ctx.stroke();

  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(tx - 16, ty - 2, 8, Math.PI * 0.4, Math.PI * 1.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(tx + 16, ty - 2, 8, -Math.PI * 0.6, Math.PI * 0.6);
  ctx.stroke();

  // Trophy pedestal base
  ctx.fillStyle = '#78350f';
  ctx.fillRect(tx - 13, ty + 15, 26, 4.5);
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(tx - 11, ty + 12, 22, 3);
  ctx.fillStyle = '#fde047';
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
  cupGrad.addColorStop(0, '#d97706');
  cupGrad.addColorStop(0.3, '#fef08a');
  cupGrad.addColorStop(0.65, '#f59e0b');
  cupGrad.addColorStop(1, '#92400e');
  ctx.fillStyle = cupGrad;
  ctx.fill();
  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Embossed star on cup
  drawStar(ctx, tx, ty - 2, 6, '#ffffff');

  // Specular cup lip highlight
  ctx.fillStyle = '#fffbeb';
  ctx.beginPath();
  ctx.ellipse(tx, ty - 12, 15, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#d97706';
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

  ctx.fillStyle = 'rgba(45, 18, 4, 0.94)';
  roundRectPath(ctx, bx, by, bw, bh, 5);
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.fillStyle = '#fef08a';
  ctx.font = '800 12px "Lilita One", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('100', bx + bw / 2, by + bh / 2 + 0.5);

  // 7. Royal "★ FINISH ★" Ribbon Across Bottom
  const rw = CELL - 14;
  const rh = 18;
  const rx = x + 7;
  const ry = y + CELL - 22;

  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1.5;

  const ribbonGrad = ctx.createLinearGradient(0, ry, 0, ry + rh);
  ribbonGrad.addColorStop(0, '#b91c1c');
  ribbonGrad.addColorStop(0.5, '#dc2626');
  ribbonGrad.addColorStop(1, '#991b1b');
  ctx.fillStyle = ribbonGrad;
  roundRectPath(ctx, rx, ry, rw, rh, 5);
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.fillStyle = '#fffbeb';
  ctx.font = '900 11px "Lilita One", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★ FINISH ★', rx + rw / 2, ry + rh / 2 + 0.5);

  ctx.restore();
}

export function drawStaticBoard(ctx: CanvasRenderingContext2D) {
  const rnd = mulberry32(20240601);

  /* wooden frame with rich mahogany tone */
  const wg = ctx.createLinearGradient(0, 0, LOGICAL, LOGICAL);
  wg.addColorStop(0, '#78350f');
  wg.addColorStop(0.3, '#92400e');
  wg.addColorStop(0.7, '#713f12');
  wg.addColorStop(1, '#451a03');
  ctx.fillStyle = wg;
  ctx.fillRect(0, 0, LOGICAL, LOGICAL);

  // Subtle wood grain
  ctx.strokeStyle = 'rgba(40, 20, 5, 0.22)';
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

  /* inner bezel border */
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.lineWidth = 10;
  ctx.strokeRect(ORIGIN - 6, ORIGIN - 6, LOGICAL - (ORIGIN - 6) * 2, LOGICAL - (ORIGIN - 6) * 2);

  ctx.strokeStyle = 'rgba(251, 191, 36, 0.45)';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(ORIGIN - 13, ORIGIN - 13, LOGICAL - (ORIGIN - 13) * 2, LOGICAL - (ORIGIN - 13) * 2);

  /* ornate corner brass brackets */
  for (const [cx, cy] of [
    [24, 24],
    [LOGICAL - 24, 24],
    [24, LOGICAL - 24],
    [LOGICAL - 24, LOGICAL - 24],
  ]) {
    const g = ctx.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, 12);
    g.addColorStop(0, '#fef08a');
    g.addColorStop(0.6, '#eab308');
    g.addColorStop(1, '#713f12');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Screw center slot
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy);
    ctx.lineTo(cx + 5, cy);
    ctx.stroke();
  }

  /* 1. Square Backgrounds & Borders */
  for (let n = 1; n <= 100; n++) {
    const c = squareCenter(n);
    const x = c.x - CELL / 2;
    const y = c.y - CELL / 2;
    const i = n - 1;
    const r = Math.floor(i / 10);
    const col = r % 2 === 0 ? i % 10 : 9 - (i % 10);
    const dark = (r + col) % 2 === 0;

    if (n === 100) {
      // Golden victory square podium background
      const g = ctx.createRadialGradient(c.x, c.y, 6, c.x, c.y, 76);
      g.addColorStop(0, '#fde047');
      g.addColorStop(0.45, '#eab308');
      g.addColorStop(1, '#a16207');
      ctx.fillStyle = g;
    } else {
      // Rich emerald / jungle tiles
      ctx.fillStyle = dark ? '#0a3d31' : '#062d24';
    }
    ctx.fillRect(x, y, CELL, CELL);

    // Inner tile sheen
    if (n !== 100) {
      const g = ctx.createLinearGradient(0, y, 0, y + CELL);
      g.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
      g.addColorStop(0.4, 'rgba(255, 255, 255, 0)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0.22)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, CELL, CELL);
    }

    // Tile border
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.75, y + 0.75, CELL - 1.5, CELL - 1.5);
  }

  /* 2. Ladders */
  for (const b of Object.keys(LADDERS)) {
    const bn = Number(b);
    drawLadder(ctx, bn, LADDERS[bn]);
  }

  /* 3. START Bay on bottom border (Square 0) - Title separated from docks */
  ctx.save();
  const bayX = 46;
  const bayY = 998;
  const bayW = 340;
  const bayH = 38;

  // Plaque outer shadow & rich mahogany base
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;

  const bayGrad = ctx.createLinearGradient(0, bayY, 0, bayY + bayH);
  bayGrad.addColorStop(0, '#2d1307');
  bayGrad.addColorStop(0.5, '#451a03');
  bayGrad.addColorStop(1, '#1e0b04');
  ctx.fillStyle = bayGrad;
  roundRectPath(ctx, bayX, bayY, bayW, bayH, 8);
  ctx.fill();

  // Brass rim
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Left Section: Dedicated Title Plaque (Separated from token docks!)
  const titleX = bayX + 4;
  const titleY = bayY + 4;
  const titleW = 104;
  const titleH = 30;

  ctx.fillStyle = 'rgba(6, 26, 18, 0.94)';
  roundRectPath(ctx, titleX, titleY, titleW, titleH, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Title: ★ START ★ and SQ 0 ➔
  ctx.fillStyle = '#fde047';
  ctx.font = '900 12.5px "Lilita One", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('★ START ★', titleX + titleW / 2, titleY + 15);

  ctx.fillStyle = '#86efac';
  ctx.font = '800 9px "Nunito", sans-serif';
  ctx.fillText('BAY • SQ 0 ➔', titleX + titleW / 2, titleY + 26);

  // Brass divider groove
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(bayX + 116, bayY + 6);
  ctx.lineTo(bayX + 116, bayY + bayH - 6);
  ctx.stroke();

  // 4 Distinct Recessed Docking Dishes (spaced comfortably for tokens)
  START_POS.forEach((pt, idx) => {
    const col = PLAYER_COLORS[idx];

    // Recessed socket dish
    const sockGrad = ctx.createRadialGradient(pt.x, pt.y - 1, 2, pt.x, pt.y, 16);
    sockGrad.addColorStop(0, '#040d08');
    sockGrad.addColorStop(0.7, '#0a1d14');
    sockGrad.addColorStop(1, '#1b3527');
    ctx.fillStyle = sockGrad;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 15, 0, Math.PI * 2);
    ctx.fill();

    // Colored player identification rim
    ctx.strokeStyle = col.base;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Soft watermark player label inside empty dock dish
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.font = '900 10px "Lilita One", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`P${idx + 1}`, pt.x, pt.y + 0.5);
  });

  // Golden navigation arrow on far right of plaque
  ctx.fillStyle = 'rgba(251, 191, 36, 0.75)';
  ctx.font = '900 13px "Lilita One", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('➔', bayX + bayW - 12, bayY + bayH / 2);

  ctx.restore();
}

export function drawBoardBadgesAndNumbers(ctx: CanvasRenderingContext2D) {
  /* 1. Badges on Snake heads & Ladder bottoms for strategic clarity */
  for (const [fromStr, portal] of Object.entries(PORTALS)) {
    const from = Number(fromStr);
    const c = squareCenter(from);
    const x = c.x - CELL / 2;
    const y = c.y - CELL / 2;

    ctx.save();
    if (portal.type === 'ladder') {
      // Golden climb badge at bottom of cell
      const bx = x + CELL - 34;
      const by = y + CELL - 22;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      roundRectPath(ctx, bx, by, 30, 18, 6);
      ctx.fill();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.fillStyle = '#fde047';
      ctx.font = '900 11px "Nunito", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`▲${portal.to}`, bx + 15, by + 9);
    } else {
      // Danger drop badge on snake head
      const bx = x + CELL - 34;
      const by = y + CELL - 22;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      roundRectPath(ctx, bx, by, 30, 18, 6);
      ctx.fill();
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.fillStyle = '#f87171';
      ctx.font = '900 11px "Nunito", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`▼${portal.to}`, bx + 15, by + 9);
    }
    ctx.restore();
  }

  /* 2. Cell Numbers (1 to 100) — Always on top of ladders & snakes! */
  for (let n = 1; n <= 100; n++) {
    const c = squareCenter(n);
    const x = c.x - CELL / 2;
    const y = c.y - CELL / 2;

    if (n === 100) {
      drawSquare100Podium(ctx, c, x, y);
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

    // Soft drop shadow to float clearly above snakes, scales, and rungs
    ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1.2;

    // Dedicated pill badge background
    if (hasSnake) {
      ctx.fillStyle = 'rgba(40, 10, 14, 0.92)';
    } else if (hasLadder) {
      ctx.fillStyle = 'rgba(14, 36, 18, 0.92)';
    } else {
      ctx.fillStyle = 'rgba(6, 22, 16, 0.86)';
    }

    roundRectPath(ctx, bx, by, bw, bh, 5);
    ctx.fill();

    // Inlaid metallic border
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = hasSnake
      ? 'rgba(239, 68, 68, 0.65)'
      : hasLadder
        ? 'rgba(245, 158, 11, 0.65)'
        : 'rgba(251, 191, 36, 0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // High-contrast crisp number text
    ctx.fillStyle = hasSnake
      ? '#fee2e2'
      : hasLadder
        ? '#fef08a'
        : '#fef9c3';
    ctx.font = '800 12.5px "Lilita One", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + bw / 2, by + bh / 2 + 0.5);

    ctx.restore();
  }
}

export function drawBoardArt(ctx: CanvasRenderingContext2D) {
  drawStaticBoard(ctx);
  drawAnimatedSnakes(ctx, 0);
  drawBoardBadgesAndNumbers(ctx);
}

/* ---------------- tokens ---------------- */

export function drawToken(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  colors: { base: string; light: string; dark: string },
  label: string,
  hopRatio = 0,
) {
  ctx.save();
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
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.beginPath();
  ctx.arc(0, 1, r * 0.52, 0, Math.PI * 2);
  ctx.fill();

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

/* Hovered cell border highlight */
export function drawHoverHighlight(
  ctx: CanvasRenderingContext2D,
  square: number,
  time: number,
) {
  if (square <= 0 || square > 100) return;
  const c = squareCenter(square);
  const x = c.x - CELL / 2;
  const y = c.y - CELL / 2;

  ctx.save();
  const pulse = 0.55 + 0.25 * Math.sin(time * 7);
  ctx.strokeStyle = `rgba(251, 191, 36, ${pulse})`;
  ctx.lineWidth = 2.5;
  ctx.shadowColor = '#f59e0b';
  ctx.shadowBlur = 10;
  roundRectPath(ctx, x + 3, y + 3, CELL - 6, CELL - 6, 8);
  ctx.stroke();
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

