import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameSpeed, PlayerPalette, Pt, WinRule } from './constants';
import {
  CELL,
  LADDER_PATHS,
  LOGICAL,
  PLAYER_COLORS,
  PORTALS,
  SNAKE_PATHS,
  SPEEDS,
  START_POS,
  clamp,
  easeInOutCubic,
  getTokenSlotOffset,
  lerp,
  pathCum,
  pointAt,
  squareCenter,
  squareFromPoint,
} from './constants';
import { sfx } from './audio';
import { THEMES, getSavedTheme, saveTheme, type BoardTheme, type ThemeId } from './themes';
import {
  drawAnimatedSnakes,
  drawBoardBadgesAndNumbers,
  drawHoverHighlight,
  drawParticles,
  drawStaticBoard,
  drawTargetHighlight,
  drawToken,
  roundRectPath,
  spawnConfetti,
  spawnDust,
  spawnFirework,
  spawnSpark,
  updateParticles,
} from './render';
import type { Particle } from './render';

export type Phase =
  | 'idle'
  | 'rolling'
  | 'moving'
  | 'sliding'
  | 'settling'
  | 'waiting'
  | 'over';
export type Mode = 'menu' | 'playing' | 'over';

export interface PlayerConfig {
  id: number;
  name: string;
  isCpu: boolean;
  colorId: number;
}

export interface Hud {
  mode: Mode;
  players: PlayerConfig[];
  turn: number;
  pos: number[];
  roll: number;
  rolling: boolean;
  phase: Phase;
  winner: number;
  rolls: number[];
  laddersHit: number[];
  snakesHit: number[];
  sixesHit: number[];
  speed: GameSpeed;
  winRule: WinRule;
  targetSquare?: number;
  hoveredSquare?: number;
}

export interface Toast {
  id: number;
  title: string;
  sub?: string;
  kind: 'gold' | 'red' | 'cyan' | 'pink' | 'lime' | 'info';
}

export interface LogEntry {
  id: number;
  text: string;
  kind: 'p0' | 'p1' | 'p2' | 'p3' | 'event';
}

interface Moving {
  player: number;
  steps: Pt[];
  idx: number;
  t0: number;
  base: number;
  finalRoll: number;
  finalTarget: number;
}

interface Sliding {
  player: number;
  pts: Pt[];
  cum: number[];
  total: number;
  t0: number;
  dur: number;
  kind: 'ladder' | 'snake';
  from: number;
  to: number;
  roll: number;
}

interface GS {
  mode: Mode;
  players: PlayerConfig[];
  turn: number;
  phase: Phase;
  rolling: boolean;
  roll: number;
  pos: number[];
  rolls: number[];
  laddersHit: number[];
  snakesHit: number[];
  sixesHit: number[];
  winner: number;
  speed: GameSpeed;
  winRule: WinRule;
  moving: Moving | null;
  sliding: Sliding | null;
  particles: Particle[];
  emotes: FloatingEmote[];
  shake: number;
  time: number;
  targetSquare?: number;
  hoveredSquare?: number;
}

export interface FloatingEmote {
  id: number;
  player: number;
  emoji: string;
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
}

export interface UseGameOptions {
  isOnline?: boolean;
  isHost?: boolean;
  onlineSlot?: number;
  onLocalRoll?: (roll: number, player: number) => void;
  onTurnSettled?: (snapshot: {
    pos: number[];
    turn: number;
    phase: string;
    rolls: number[];
    laddersHit: number[];
    snakesHit: number[];
    sixesHit: number[];
    winner: number;
  }) => void;
}

const defaultPlayers: PlayerConfig[] = [
  { id: 0, name: 'You', isCpu: false, colorId: 0 },
  { id: 1, name: 'CPU', isCpu: true, colorId: 1 },
];

const initialGS = (): GS => ({
  mode: 'menu',
  players: defaultPlayers,
  turn: 0,
  phase: 'idle',
  rolling: false,
  roll: 0,
  pos: [0, 0],
  rolls: [0, 0],
  laddersHit: [0, 0],
  snakesHit: [0, 0],
  sixesHit: [0, 0],
  winner: -1,
  speed: 'normal',
  winRule: 'exact',
  moving: null,
  sliding: null,
  particles: [],
  emotes: [],
  shake: 0,
  time: 0,
});

export function useGame(options: UseGameOptions = {}) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const {
    isOnline = false,
    isHost = false,
    onlineSlot = 0,
  } = options;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const gs = useRef<GS>(initialGS());
  const pendingCheckpoint = useRef<{
    pos: number[];
    turn: number;
    phase: string;
    rolls: number[];
    laddersHit: number[];
    snakesHit: number[];
    sixesHit: number[];
    winner: number;
  } | null>(null);
  const boardLayer = useRef<HTMLCanvasElement | null>(null);
  const numberLayer = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef(0);
  const timers = useRef<number[]>([]);
  const toastId = useRef(0);
  const logId = useRef(0);

  const [hud, setHud] = useState<Hud>({
    mode: 'menu',
    players: defaultPlayers,
    turn: 0,
    pos: [0, 0],
    roll: 0,
    rolling: false,
    phase: 'idle',
    winner: -1,
    rolls: [0, 0],
    laddersHit: [0, 0],
    snakesHit: [0, 0],
    sixesHit: [0, 0],
    speed: 'normal',
    winRule: 'exact',
  });

  const [toast, setToast] = useState<Toast | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [muted, setMuted] = useState(false);
  const [showWin, setShowWin] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'restart' | 'menu' | null>(null);
  const [hoveredSquare, setHoveredSquare] = useState<number | undefined>(undefined);
  const [themeId, setThemeIdState] = useState<ThemeId>(() => getSavedTheme());
  const themeRef = useRef<BoardTheme>(THEMES[themeId] || THEMES.jungle);
  themeRef.current = THEMES[themeId] || THEMES.jungle;

  const setTheme = useCallback((id: ThemeId) => {
    if (!THEMES[id]) return;
    saveTheme(id);
    themeRef.current = THEMES[id];
    setThemeIdState(id);
  }, []);

  const sync = useCallback((patch: Partial<Hud>) => {
    setHud((h) => ({ ...h, ...patch }));
  }, []);

  const after = useCallback((ms: number, fn: () => void) => {
    const t = window.setTimeout(fn, ms);
    timers.current.push(t);
    return t;
  }, []);

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const playerName = useCallback((p: number) => {
    const g = gs.current;
    return g.players[p]?.name ?? `Player ${p + 1}`;
  }, []);

  const playerPalette = useCallback((p: number): PlayerPalette => {
    const g = gs.current;
    const colorId = g.players[p]?.colorId ?? p;
    return PLAYER_COLORS[colorId % PLAYER_COLORS.length];
  }, []);

  const pushLog = useCallback((text: string, kind: LogEntry['kind']) => {
    logId.current += 1;
    const id = logId.current;
    setLog((l) => [{ id, text, kind }, ...l].slice(0, 8));
  }, []);

  const showToast = useCallback(
    (title: string, sub: string | undefined, kind: Toast['kind']) => {
      toastId.current += 1;
      const id = toastId.current;
      setToast({ id, title, sub, kind });
      after(1600, () => setToast((t) => (t && t.id === id ? null : t)));
    },
    [after],
  );

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      sfx.enabled = m;
      return !m;
    });
  }, []);

  const setSpeed = useCallback((spd: GameSpeed) => {
    gs.current.speed = spd;
    setHud((h) => ({ ...h, speed: spd }));
  }, []);

  const setWinRule = useCallback((rule: WinRule) => {
    gs.current.winRule = rule;
    setHud((h) => ({ ...h, winRule: rule }));
  }, []);

  /* ---------- board layer rendering ---------- */

  const renderBoardLayer = useCallback((theme?: BoardTheme) => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width < 10) return;
    const currentTheme = theme || themeRef.current;

    // 1. Static base board layer
    const c1 = document.createElement('canvas');
    c1.width = canvas.width;
    c1.height = canvas.height;
    const ctx1 = c1.getContext('2d');
    if (ctx1) {
      const s = c1.width / LOGICAL;
      ctx1.setTransform(s, 0, 0, s, 0, 0);
      drawStaticBoard(ctx1, currentTheme);
      boardLayer.current = c1;
    }

    // 2. High-contrast numbers & badges layer (rendered ON TOP of animated snakes)
    const c2 = document.createElement('canvas');
    c2.width = canvas.width;
    c2.height = canvas.height;
    const ctx2 = c2.getContext('2d');
    if (ctx2) {
      const s = c2.width / LOGICAL;
      ctx2.setTransform(s, 0, 0, s, 0, 0);
      drawBoardBadgesAndNumbers(ctx2, currentTheme);
      numberLayer.current = c2;
    }
  }, []);

  useEffect(() => {
    renderBoardLayer(THEMES[themeId] || THEMES.jungle);
  }, [themeId, renderBoardLayer]);

  /* ---------- game flow ---------- */

  const resetGS = useCallback(
    (players: PlayerConfig[], speed: GameSpeed, winRule: WinRule) => {
      const g = gs.current;
      const count = players.length;
      g.players = players;
      g.turn = 0;
      g.phase = 'idle';
      g.rolling = false;
      g.roll = 0;
      g.pos = new Array(count).fill(0);
      g.rolls = new Array(count).fill(0);
      g.laddersHit = new Array(count).fill(0);
      g.snakesHit = new Array(count).fill(0);
      g.sixesHit = new Array(count).fill(0);
      g.winner = -1;
      g.speed = speed;
      g.winRule = winRule;
      g.moving = null;
      g.sliding = null;
      g.particles = [];
      g.emotes = [];
      g.shake = 0;
      g.targetSquare = undefined;
      pendingCheckpoint.current = null;
    },
    [],
  );

  const startGame = useCallback(
    (
      players: PlayerConfig[] = defaultPlayers,
      speed: GameSpeed = 'normal',
      winRule: WinRule = 'exact',
    ) => {
      clearTimers();
      resetGS(players, speed, winRule);
      gs.current.mode = 'playing';

      sync({
        mode: 'playing',
        players,
        turn: 0,
        pos: new Array(players.length).fill(0),
        roll: 0,
        rolling: false,
        phase: 'idle',
        winner: -1,
        rolls: new Array(players.length).fill(0),
        laddersHit: new Array(players.length).fill(0),
        snakesHit: new Array(players.length).fill(0),
        sixesHit: new Array(players.length).fill(0),
        speed,
        winRule,
        targetSquare: undefined,
      });

      setLog([]);
      setShowWin(false);
      setConfirmAction(null);
      sfx.click();

      const p0Name = players[0]?.name ?? 'Player 1';
      showToast(`${p0Name.toUpperCase()} STARTS`, 'Roll the dice to begin!', 'cyan');
      pushLog(`Match started — ${p0Name} has the opening turn!`, 'event');
    },
    [clearTimers, pushLog, resetGS, showToast, sync],
  );

  const backToMenu = useCallback(() => {
    clearTimers();
    const g = gs.current;
    g.mode = 'menu';
    g.phase = 'idle';
    g.moving = null;
    g.sliding = null;
    g.particles = [];
    g.emotes = [];
    g.targetSquare = undefined;
    sync({ mode: 'menu', phase: 'idle' });
    setShowWin(false);
    setToast(null);
    setConfirmAction(null);
    sfx.click();
  }, [clearTimers, sync]);

  /* Apply authoritative checkpoint from host */
  const applyCheckpoint = useCallback(
    (checkpoint: {
      pos: number[];
      turn: number;
      phase: string;
      rolls: number[];
      laddersHit: number[];
      snakesHit: number[];
      sixesHit: number[];
      winner: number;
    }) => {
      const g = gs.current;
      if (g.mode !== 'playing') return;

      g.pos = [...checkpoint.pos];
      g.turn = checkpoint.turn;
      g.rolls = [...checkpoint.rolls];
      g.laddersHit = [...checkpoint.laddersHit];
      g.snakesHit = [...checkpoint.snakesHit];
      g.sixesHit = [...checkpoint.sixesHit];

      if (checkpoint.winner >= 0) {
        g.winner = checkpoint.winner;
        g.mode = 'over';
        g.phase = 'over';
        setShowWin(true);
      }

      const nextPhase = (checkpoint.phase as Phase) || 'idle';
      g.phase = nextPhase;

      sync({
        pos: [...g.pos],
        turn: g.turn,
        phase: nextPhase,
        rolls: [...g.rolls],
        laddersHit: [...g.laddersHit],
        snakesHit: [...g.snakesHit],
        sixesHit: [...g.sixesHit],
        winner: g.winner,
      });
    },
    [sync],
  );

  const switchTurn = useCallback(
    (fromPlayer?: number) => {
      const g = gs.current;
      const current = typeof fromPlayer === 'number' ? fromPlayer : g.turn;
      const next = (current + 1) % g.players.length;
      g.turn = next;
      g.phase = 'idle';
      g.roll = 0;
      g.targetSquare = undefined;
      sync({ turn: next, phase: 'idle', roll: 0, targetSquare: undefined });

      const { isOnline, isHost, onTurnSettled } = optionsRef.current;
      if (isOnline && isHost) {
        onTurnSettled?.({
          pos: [...g.pos],
          turn: next,
          phase: 'idle',
          rolls: [...g.rolls],
          laddersHit: [...g.laddersHit],
          snakesHit: [...g.snakesHit],
          sixesHit: [...g.sixesHit],
          winner: g.winner,
        });
      }

      // If a checkpoint arrived during this turn's animation, safely reconcile now
      if (pendingCheckpoint.current) {
        const cp = pendingCheckpoint.current;
        pendingCheckpoint.current = null;
        applyCheckpoint(cp);
      }
    },
    [applyCheckpoint, sync],
  );

  const finishTurn = useCallback(
    (player: number, v: number) => {
      const g = gs.current;
      if (g.mode !== 'playing') return;

      if (g.pos[player] === 100) {
        g.mode = 'over';
        g.phase = 'over';
        g.winner = player;
        sync({ mode: 'over', phase: 'over', winner: player });
        pushLog(`🏆 ${playerName(player)} conquered square 100 and WON THE GAME!`, 'event');
        sfx.win();

        spawnConfetti(g.particles);
        spawnFirework(g.particles, 520, 200);
        after(500, () => {
          spawnConfetti(gs.current.particles);
          spawnFirework(gs.current.particles, 300, 300);
        });
        after(1100, () => {
          spawnConfetti(gs.current.particles);
          spawnFirework(gs.current.particles, 740, 260);
        });
        after(1500, () => setShowWin(true));

        const { isOnline, isHost, onTurnSettled } = optionsRef.current;
        if (isOnline && isHost) {
          onTurnSettled?.({
            pos: [...g.pos],
            turn: player,
            phase: 'over',
            rolls: [...g.rolls],
            laddersHit: [...g.laddersHit],
            snakesHit: [...g.snakesHit],
            sixesHit: [...g.sixesHit],
            winner: g.winner,
          });
        }
        return;
      }

      if (v === 6) {
        g.sixesHit[player] += 1;
        g.turn = player; // Ensure active turn stays with this player
        g.phase = 'waiting';
        sync({ turn: player, phase: 'waiting', sixesHit: [...g.sixesHit] });
        showToast('LUCKY SIX!', `${playerName(player)} earns an extra roll!`, 'gold');
        sfx.ding();
        const cfg = SPEEDS[g.speed];
        after(cfg.settleMs + 350, () => {
          gs.current.phase = 'idle';
          sync({ phase: 'idle' });

          const { isOnline, isHost, onTurnSettled } = optionsRef.current;
          if (isOnline && isHost) {
            onTurnSettled?.({
              pos: [...gs.current.pos],
              turn: gs.current.turn,
              phase: 'idle',
              rolls: [...gs.current.rolls],
              laddersHit: [...gs.current.laddersHit],
              snakesHit: [...gs.current.snakesHit],
              sixesHit: [...gs.current.sixesHit],
              winner: gs.current.winner,
            });
          }

          if (pendingCheckpoint.current) {
            const cp = pendingCheckpoint.current;
            pendingCheckpoint.current = null;
            applyCheckpoint(cp);
          }
        });
      } else {
        switchTurn(player);
      }
    },
    [after, applyCheckpoint, playerName, pushLog, showToast, switchTurn, sync],
  );

  const afterMove = useCallback(
    (player: number, target: number, v: number) => {
      const g = gs.current;
      const portal = PORTALS[target];
      const cfg = SPEEDS[g.speed];

      if (portal?.type === 'ladder') {
        const up = portal.to;
        g.laddersHit[player] += 1;
        const pts = LADDER_PATHS[target];
        const { cum, total } = pathCum(pts);
        g.sliding = {
          player,
          pts,
          cum,
          total,
          t0: performance.now() + 60,
          dur: cfg.slideMs,
          kind: 'ladder',
          from: target,
          to: up,
          roll: v,
        };
        g.phase = 'sliding';
        sync({ phase: 'sliding', laddersHit: [...g.laddersHit] });
        showToast('GOLDEN LADDER!', `Climbing ${target} ➔ ${up}!`, 'gold');
        pushLog(
          `🪜 ${playerName(player)} caught a ladder: ${target} ➔ ${up}`,
          `p${player}` as any,
        );
        sfx.ladder();
      } else if (portal?.type === 'snake') {
        const down = portal.to;
        g.snakesHit[player] += 1;
        const pts = SNAKE_PATHS[target];
        const { cum, total } = pathCum(pts);
        g.sliding = {
          player,
          pts,
          cum,
          total,
          t0: performance.now() + 60,
          dur: cfg.slideMs,
          kind: 'snake',
          from: target,
          to: down,
          roll: v,
        };
        g.phase = 'sliding';
        sync({ phase: 'sliding', snakesHit: [...g.snakesHit] });
        showToast('SNAKE BITE!', `Slithering down ${target} ➔ ${down}!`, 'red');
        pushLog(
          `🐍 ${playerName(player)} was bitten by a snake: ${target} ➔ ${down}`,
          `p${player}` as any,
        );
        sfx.snake();
      } else {
        // Normal square landing settle phase
        g.phase = 'settling';
        sync({ phase: 'settling' });
        sfx.land();
        const c = squareCenter(target);
        spawnDust(g.particles, c.x, c.y);

        after(cfg.settleMs, () => {
          finishTurn(player, v);
        });
      }
    },
    [after, finishTurn, playerName, pushLog, showToast, sync],
  );

  const resolveRoll = useCallback(
    (player: number, v: number) => {
      const g = gs.current;
      const pos = g.pos[player];

      if (pos + v > 100) {
        if (g.winRule === 'bounce') {
          // Bounce back rule
          const overshoot = pos + v - 100;
          const bounceTarget = 100 - overshoot;
          const steps: Pt[] = [];

          // Forward to 100
          for (let s = pos + 1; s <= 100; s++) steps.push(squareCenter(s));
          // Reverse back from 99 to bounceTarget
          for (let s = 99; s >= bounceTarget; s--) steps.push(squareCenter(s));

          g.targetSquare = bounceTarget;
          showToast('BOUNCED BACK!', `Overshot 100 ➔ bounced to ${bounceTarget}`, 'pink');
          sfx.buzz();
          pushLog(
            `↩️ ${playerName(player)} overshot 100 and bounced back to square ${bounceTarget}`,
            'event',
          );

          g.moving = {
            player,
            steps,
            idx: 0,
            t0: performance.now() + 60,
            base: pos,
            finalRoll: v,
            finalTarget: bounceTarget,
          };
          g.phase = 'moving';
          sync({ phase: 'moving', targetSquare: bounceTarget });
          return;
        } else {
          // Exact roll required
          g.phase = 'waiting';
          sync({ phase: 'waiting' });
          showToast('NEED EXACT ROLL', `Must land on 100 exactly (need ${100 - pos})`, 'info');
          pushLog(
            `⚠️ ${playerName(player)} needs exactly ${100 - pos} to win — turn passed`,
            'event',
          );
          sfx.buzz();
          const cfg = SPEEDS[g.speed];
          after(cfg.settleMs + 650, () => switchTurn(player));
          return;
        }
      }

      const target = pos + v;
      g.targetSquare = target;
      const steps: Pt[] = [];
      for (let s = pos + 1; s <= target; s++) steps.push(squareCenter(s));

      g.moving = {
        player,
        steps,
        idx: 0,
        t0: performance.now() + 60,
        base: pos,
        finalRoll: v,
        finalTarget: target,
      };
      g.phase = 'moving';
      sync({ phase: 'moving', targetSquare: target });
    },
    [after, playerName, pushLog, showToast, switchTurn, sync],
  );

  const doRoll = useCallback(
    (isAI = false) => {
      const g = gs.current;
      if (g.mode !== 'playing' || g.phase !== 'idle' || g.rolling) return;

      const { isOnline, onlineSlot, onLocalRoll } = optionsRef.current;
      const currPlayer = g.players[g.turn];
      if (currPlayer?.isCpu && !isAI) return;

      // In online mode, human player can only roll on their assigned slot
      if (isOnline && !currPlayer?.isCpu && g.turn !== onlineSlot) return;

      // Cleanly settle any lingering movement
      if (g.moving) {
        g.pos[g.moving.player] = g.moving.finalTarget;
        g.moving = null;
      }
      if (g.sliding) {
        g.pos[g.sliding.player] = g.sliding.to;
        g.sliding = null;
      }

      const activeTurn = g.turn;
      g.rolling = true;
      g.phase = 'rolling';
      const v = 1 + Math.floor(Math.random() * 6);
      g.roll = v;
      g.rolls[activeTurn] += 1;

      // Broadcast to network if online
      if (isOnline) {
        onLocalRoll?.(v, activeTurn);
      }

      const projectedTarget = g.pos[activeTurn] + v <= 100 ? g.pos[activeTurn] + v : undefined;
      g.targetSquare = projectedTarget;

      sync({
        rolling: true,
        phase: 'rolling',
        roll: v,
        rolls: [...g.rolls],
        targetSquare: projectedTarget,
      });

      sfx.roll();
      const cfg = SPEEDS[g.speed];

      after(cfg.rollMs, () => {
        const gg = gs.current;
        gg.rolling = false;
        sync({ rolling: false, roll: v });

        // Log the roll precisely when it lands!
        pushLog(
          `🎲 ${playerName(activeTurn)} rolled a ${v}`,
          `p${activeTurn}` as any,
        );

        resolveRoll(activeTurn, v);
      });
    },
    [after, playerName, pushLog, resolveRoll, sync],
  );

  /* Trigger roll coming from a remote network peer */
  const doRemoteRoll = useCallback(
    (v: number, playerIndex?: number) => {
      const g = gs.current;
      if (g.mode !== 'playing') return;

      const activeTurn =
        typeof playerIndex === 'number' && playerIndex >= 0 && playerIndex < g.players.length
          ? playerIndex
          : g.turn;

      // Cleanly settle any lingering movement from prior turn
      if (g.moving) {
        g.pos[g.moving.player] = g.moving.finalTarget;
        g.moving = null;
      }
      if (g.sliding) {
        g.pos[g.sliding.player] = g.sliding.to;
        g.sliding = null;
      }

      g.turn = activeTurn;
      g.rolling = true;
      g.phase = 'rolling';
      g.roll = v;
      g.rolls[activeTurn] += 1;

      const projectedTarget = g.pos[activeTurn] + v <= 100 ? g.pos[activeTurn] + v : undefined;
      g.targetSquare = projectedTarget;

      sync({
        rolling: true,
        phase: 'rolling',
        roll: v,
        rolls: [...g.rolls],
        targetSquare: projectedTarget,
        turn: activeTurn,
      });

      sfx.roll();
      const cfg = SPEEDS[g.speed];

      after(cfg.rollMs, () => {
        const gg = gs.current;
        gg.rolling = false;
        sync({ rolling: false, roll: v });

        pushLog(
          `🎲 ${playerName(activeTurn)} rolled a ${v}`,
          `p${activeTurn}` as any,
        );

        resolveRoll(activeTurn, v);
      });
    },
    [after, playerName, pushLog, resolveRoll, sync],
  );

  /* Synchronize full game state from authoritative host checkpoint */
  const syncFromCheckpoint = useCallback(
    (checkpoint: {
      pos: number[];
      turn: number;
      phase: string;
      rolls: number[];
      laddersHit: number[];
      snakesHit: number[];
      sixesHit: number[];
      winner: number;
    }) => {
      const g = gs.current;
      if (g.mode !== 'playing') return;

      // If this client is currently mid-animation, defer until turn finishes to prevent desync
      if (g.moving || g.sliding || g.rolling) {
        pendingCheckpoint.current = checkpoint;
        return;
      }

      applyCheckpoint(checkpoint);
    },
    [applyCheckpoint],
  );

  /* Trigger floating emoji above player's token */
  const triggerEmote = useCallback((player: number, emoji: string) => {
    const g = gs.current;
    const p = Math.max(0, Math.min(g.players.length - 1, player));
    const pos = g.pos[p] || 0;
    const c = squareCenter(pos);
    sfx.pop();
    g.emotes.push({
      id: Math.random(),
      player: p,
      emoji,
      x: c.x + (Math.random() - 0.5) * 24,
      y: c.y - 12,
      vy: -55,
      life: 1.8,
      maxLife: 1.8,
    });
  }, []);

  /* ---------- AI Turn Handling ---------- */

  useEffect(() => {
    if (hud.mode !== 'playing' || hud.phase !== 'idle') return;
    const currPlayer = hud.players[hud.turn];
    if (!currPlayer?.isCpu) return;

    // In online matches, only the Host executes CPU bot moves
    if (isOnline && !isHost) return;

    const cfg = SPEEDS[hud.speed];
    const t = window.setTimeout(() => doRoll(true), cfg.aiDelayMs);
    return () => window.clearTimeout(t);
  }, [hud.mode, hud.players, hud.turn, hud.phase, hud.speed, doRoll, isOnline, isHost]);

  /* ---------- Keyboard Shortcuts ---------- */

  const doRollRef = useRef(doRoll);
  doRollRef.current = doRoll;
  const startRef = useRef(startGame);
  startRef.current = startGame;
  const muteRef = useRef(toggleMute);
  muteRef.current = toggleMute;
  const speedRef = useRef(setSpeed);
  speedRef.current = setSpeed;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (gs.current.mode === 'menu') {
          startRef.current();
        } else if (gs.current.mode === 'over') {
          startRef.current(gs.current.players, gs.current.speed, gs.current.winRule);
        } else {
          doRollRef.current();
        }
      } else if (e.code === 'KeyM') {
        muteRef.current();
      } else if (e.code === 'KeyS') {
        const nextSpeed: Record<GameSpeed, GameSpeed> = {
          normal: 'fast',
          fast: 'turbo',
          turbo: 'normal',
        };
        speedRef.current(nextSpeed[gs.current.speed]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ---------- Resize + Board Pre-render ---------- */

  useEffect(() => {
    if (hud.mode === 'menu') return;
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    let touchTimer = 0;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const size = Math.floor(Math.min(rect.width, rect.height));
      if (size < 20) return;

      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      const targetPx = Math.round(size * dpr);
      const sizeChanged = sizeRef.current !== size || canvas.width !== targetPx;

      sizeRef.current = size;
      canvas.width = targetPx;
      canvas.height = targetPx;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;

      if (sizeChanged) {
        renderBoardLayer();
      }
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    let alive = true;
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (alive) renderBoardLayer();
      });
    }

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const lx = ((e.clientX - rect.left) / rect.width) * LOGICAL;
      const ly = ((e.clientY - rect.top) / rect.height) * LOGICAL;
      const sq = squareFromPoint(lx, ly);
      const val = sq ?? undefined;
      if (gs.current.hoveredSquare !== val) {
        gs.current.hoveredSquare = val;
        setHoveredSquare(val);
      }

      // If pointer is touch, auto-clear inspection badge after 2.5s
      if (e.pointerType === 'touch' && val !== undefined) {
        window.clearTimeout(touchTimer);
        touchTimer = window.setTimeout(() => {
          gs.current.hoveredSquare = undefined;
          setHoveredSquare(undefined);
        }, 2500);
      }
    };

    const onPointerLeave = () => {
      window.clearTimeout(touchTimer);
      if (gs.current.hoveredSquare !== undefined) {
        gs.current.hoveredSquare = undefined;
        setHoveredSquare(undefined);
      }
    };

    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerdown', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);

    return () => {
      alive = false;
      window.clearTimeout(touchTimer);
      ro.disconnect();
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
    };
  }, [hud.mode, renderBoardLayer]);

  /* ---------- Main Loop + Drawing ---------- */

  const tokenPoint = useCallback(
    (p: number, now: number): { x: number; y: number; hopRatio: number } => {
      const g = gs.current;
      const cfg = SPEEDS[g.speed];

      if ((g.moving && g.moving.player === p) || (g.sliding && g.sliding.player === p)) {
        if (g.moving && g.moving.player === p) {
          const m = g.moving;
          const el = now - m.t0;
          if (el >= 0) {
            const i = Math.min(m.steps.length - 1, Math.floor(el / cfg.hopMs));
            const f = clamp((el - i * cfg.hopMs) / cfg.hopMs, 0, 1);
            const from =
              i === 0
                ? m.base <= 0
                  ? START_POS[p]
                  : squareCenter(m.base)
                : m.steps[i - 1];
            const to = m.steps[i];
            const hop = Math.sin(Math.PI * f);
            return {
              x: lerp(from.x, to.x, f),
              y: lerp(from.y, to.y, f) - hop * 30,
              hopRatio: hop,
            };
          }
        } else if (g.sliding && g.sliding.player === p) {
          const sl = g.sliding;
          const f = easeInOutCubic(clamp((now - sl.t0) / sl.dur, 0, 1));
          const pt = pointAt(sl.pts, sl.cum, f * sl.total);
          return { x: pt.x, y: pt.y, hopRatio: 0 };
        }
      }

      const n = g.pos[p];
      if (n <= 0) return { x: START_POS[p].x, y: START_POS[p].y, hopRatio: 0 };

      const c = squareCenter(n);
      // Multi-token arrangement on the same square
      const sharing: number[] = [];
      for (let i = 0; i < g.players.length; i++) {
        if (g.pos[i] === n) sharing.push(i);
      }

      const slotIdx = sharing.indexOf(p);
      const offset = getTokenSlotOffset(slotIdx, sharing.length);

      return { x: c.x + offset.x, y: c.y + offset.y, hopRatio: 0 };
    },
    [],
  );

  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const draw = () => {
      const canvas = canvasRef.current;
      const bLayer = boardLayer.current;
      const nLayer = numberLayer.current;
      if (!canvas || !bLayer || canvas.width < 10) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const g = gs.current;
      const w = canvas.width;
      const s = w / LOGICAL;

      let ox = 0;
      let oy = 0;
      if (g.shake > 0.4) {
        ox = (Math.random() - 0.5) * g.shake * s;
        oy = (Math.random() - 0.5) * g.shake * s;
      }

      // 1. Draw static board layer 1:1 pixel crisp with zero double-sampling blur
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bLayer, ox, oy);

      // 2. Switch to logical coordinate space for animated elements
      ctx.setTransform(s, 0, 0, s, ox, oy);

      // 3. Draw animated living snakes (slither waves, breathing, eye blinking, flicking tongue, strike reaction)
      const activeSnakeHead = g.sliding?.kind === 'snake' ? g.sliding.from : undefined;
      drawAnimatedSnakes(ctx, g.time, activeSnakeHead, themeRef.current);

      // 4. Blit numbers & badges layer strictly ON TOP of the animated snakes!
      if (nLayer) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(nLayer, ox, oy);
        ctx.setTransform(s, 0, 0, s, ox, oy);
      }

      const now = g.time * 1000;

      // Active player square pulsing highlight
      if (
        g.mode === 'playing' &&
        (g.phase === 'idle' || g.phase === 'rolling' || g.phase === 'waiting')
      ) {
        const p = g.turn;
        const n = g.pos[p];
        if (n > 0) {
          const c = squareCenter(n);
          const pal = PLAYER_COLORS[g.players[p]?.colorId ?? p];
          const pulse = 0.5 + 0.35 * Math.sin(g.time * 5);
          ctx.save();
          ctx.strokeStyle = pal.base;
          ctx.globalAlpha = pulse;
          ctx.lineWidth = 5;
          ctx.shadowColor = pal.base;
          ctx.shadowBlur = 18;
          roundRectPath(ctx, c.x - CELL / 2 + 5, c.y - CELL / 2 + 5, CELL - 10, CELL - 10, 12);
          ctx.stroke();
          ctx.restore();
        }
      }

      // Projected landing preview
      if (g.targetSquare && (g.phase === 'rolling' || g.phase === 'moving')) {
        const pal = PLAYER_COLORS[g.players[g.turn]?.colorId ?? g.turn];
        drawTargetHighlight(ctx, g.targetSquare, pal.base, g.time);
      }

      // Hovered square inspection highlight
      if (g.hoveredSquare && g.hoveredSquare !== g.targetSquare) {
        drawHoverHighlight(ctx, g.hoveredSquare, g.time);
      }

      // Square 100 Finish Line ambient beacon
      if (g.mode === 'playing') {
        const c100 = squareCenter(100);
        const beaconAccent = themeRef.current.ui.accent;
        const pulse = 0.35 + 0.25 * Math.sin(g.time * 3.5);
        ctx.save();
        ctx.strokeStyle = beaconAccent;
        ctx.globalAlpha = pulse;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = beaconAccent;
        ctx.shadowBlur = 14;
        roundRectPath(ctx, c100.x - CELL / 2 + 3, c100.y - CELL / 2 + 3, CELL - 6, CELL - 6, 8);
        ctx.stroke();
        ctx.restore();
      }

      // Draw tokens (inactive tokens first, active on top)
      const order = Array.from({ length: g.players.length }, (_, i) => i).sort(
        (a, b) => (a === g.turn ? 1 : 0) - (b === g.turn ? 1 : 0),
      );

      for (const p of order) {
        const tp = tokenPoint(p, now);
        const idleBob =
          g.phase === 'idle' || g.phase === 'rolling' || g.phase === 'over'
            ? Math.sin(g.time * 2.6 + p * 1.5) * 2.2
            : 0;
        const r = 22 * (1 + 0.22 * tp.hopRatio);
        const pal = PLAYER_COLORS[g.players[p]?.colorId ?? p];
        drawToken(ctx, tp.x, tp.y + idleBob, r, pal, String(p + 1), tp.hopRatio);
      }

      drawParticles(ctx, g.particles);

      // Draw floating reaction emotes
      for (const em of g.emotes) {
        const progress = em.life / em.maxLife;
        const alpha = Math.min(1, progress * 2.2);
        const popScale = progress > 0.8 ? 1 + (1 - progress) * 2 : 1;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = `${Math.round(36 * popScale)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = 10;
        ctx.fillText(em.emoji, em.x, em.y);
        ctx.restore();
      }
    };

    const step = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      const g = gs.current;
      g.time = now / 1000;
      const cfg = SPEEDS[g.speed];

      /* Hopping steps */
      if (g.moving) {
        const m = g.moving;
        const el = now - m.t0;
        if (el >= 0) {
          const idx = Math.min(m.steps.length, Math.floor(el / cfg.hopMs));
          while (m.idx < idx) {
            m.idx += 1;
            // Intermediate pos for HUD
            const curStep = m.steps[m.idx - 1];
            sfx.hop(m.idx - 1);
            spawnDust(g.particles, curStep.x, curStep.y);
          }
          if (m.idx >= m.steps.length) {
            const movingPlayer = m.player;
            g.moving = null;
            g.pos[movingPlayer] = m.finalTarget;
            sync({ pos: [...g.pos] });
            afterMove(movingPlayer, m.finalTarget, m.finalRoll);
          }
        }
      }

      /* Sliding down snakes / up ladders */
      if (g.sliding) {
        const sl = g.sliding;
        const f = (now - sl.t0) / sl.dur;
        if (f >= 1) {
          const slidingPlayer = sl.player;
          g.pos[slidingPlayer] = sl.to;
          g.sliding = null;
          sync({ pos: [...g.pos] });
          if (sl.kind === 'snake') {
            g.shake = 14;
            sfx.hit();
            const c = squareCenter(sl.to);
            spawnDust(g.particles, c.x, c.y);
            for (let i = 0; i < 9; i++) spawnSpark(g.particles, c.x, c.y, '#f87171');
          } else {
            sfx.ding();
            const c = squareCenter(sl.to);
            for (let i = 0; i < 9; i++) spawnSpark(g.particles, c.x, c.y, '#fde047');
          }
          finishTurn(slidingPlayer, sl.roll);
        } else if (f > 0) {
          const f2 = easeInOutCubic(clamp(f, 0, 1));
          const pt = pointAt(sl.pts, sl.cum, f2 * sl.total);
          if (Math.random() < 0.65) {
            spawnSpark(g.particles, pt.x, pt.y, sl.kind === 'ladder' ? '#ffd75e' : '#f87171');
          }
        }
      }

      updateParticles(g.particles, dt / 1000);

      // Update floating emotes
      for (let i = g.emotes.length - 1; i >= 0; i--) {
        const em = g.emotes[i];
        em.life -= dt / 1000;
        em.y += em.vy * (dt / 1000);
        if (em.life <= 0) {
          g.emotes.splice(i, 1);
        }
      }

      g.shake *= Math.pow(0.88, dt / 16.7);
      if (g.shake < 0.4) g.shake = 0;

      draw();
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [afterMove, finishTurn, sync, tokenPoint]);

  const canRoll =
    hud.mode === 'playing' &&
    hud.phase === 'idle' &&
    !hud.rolling &&
    (isOnline ? hud.turn === onlineSlot : true) &&
    !hud.players[hud.turn]?.isCpu;

  const requestRestart = useCallback(() => {
    if (hud.mode === 'playing') {
      setConfirmAction('restart');
    } else {
      startGame(hud.players, hud.speed, hud.winRule);
    }
  }, [hud.mode, hud.players, hud.speed, hud.winRule, startGame]);

  const requestMenu = useCallback(() => {
    if (hud.mode === 'playing') {
      setConfirmAction('menu');
    } else {
      backToMenu();
    }
  }, [backToMenu, hud.mode]);

  const confirmPending = useCallback(() => {
    if (confirmAction === 'restart') {
      startGame(hud.players, hud.speed, hud.winRule);
    } else if (confirmAction === 'menu') {
      backToMenu();
    }
    setConfirmAction(null);
  }, [backToMenu, confirmAction, hud.players, hud.speed, hud.winRule, startGame]);

  const cancelPending = useCallback(() => {
    setConfirmAction(null);
  }, []);

  const getSnapshot = useCallback(() => {
    const s = gs.current;
    return {
      pos: [...s.pos],
      turn: s.turn,
      phase: s.phase,
      rolls: [...s.rolls],
      laddersHit: [...s.laddersHit],
      snakesHit: [...s.snakesHit],
      sixesHit: [...s.sixesHit],
      winner: s.winner,
      isPlaying: s.mode === 'playing',
    };
  }, []);

  const updatePlayers = useCallback((players: PlayerConfig[]) => {
    gs.current.players = players;
    setHud((h) => ({ ...h, players }));
  }, []);

  return {
    canvasRef,
    wrapRef,
    hud,
    toast,
    log,
    muted,
    showWin,
    canRoll,
    confirmAction,
    hoveredSquare,
    theme: THEMES[themeId] || THEMES.jungle,
    themeId,
    setTheme,
    playerName,
    playerPalette,
    startGame,
    updatePlayers,
    doRoll,
    doRemoteRoll,
    syncFromCheckpoint,
    triggerEmote,
    backToMenu,
    toggleMute,
    setSpeed,
    setWinRule,
    requestRestart,
    requestMenu,
    confirmPending,
    cancelPending,
    showToast,
    getSnapshot,
  };
}

