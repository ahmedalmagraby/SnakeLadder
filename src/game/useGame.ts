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
  prefersReducedMotion,
  squareCenter,
  squareFromPoint,
  getSnakeSlidePoint,
} from './constants';
import { sfx } from './audio';
import { THEMES, getSavedTheme, saveTheme, type BoardTheme, type ThemeId } from './themes';
import {
  drawActivePlayerEdge,
  drawAmbientMotes,
  drawAnimatedSnakes,
  drawBoardBadgesAndNumbers,
  drawCornerPulse,
  drawFrameSweep,
  drawHopTrail,
  drawHoverHighlight,
  drawImpactFlash,
  drawLadderClimbGlow,
  drawParticles,
  drawPodiumPresence,
  drawStaticBoard,
  drawTargetHighlight,
  drawToken,
  drawTurnRing,
  roundRectPath,
  spawnConfetti,
  spawnDust,
  spawnFirework,
  spawnRing,
  spawnSpark,
  updateParticles,
  type Particle,
} from './render';
import type { CheckpointMode, GameStateSnapshot } from './network/types';
import {
  gameReducer,
  initialGameState,
  isStablePhase,
  isNonStablePhase,
  isTerminalCheckpoint,
  defaultPlayers,
  slotToIndex,
  type Phase,
  type Mode,
  type PlayerConfig,
  type CheckpointData,
  type GameState,
  type GameAction,
  type Sliding,
  type FloatingEmote,
} from './gameReducer';

export type { Phase, Mode, PlayerConfig, CheckpointData, Sliding, FloatingEmote, GameState, GameAction };

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

/** (P2) The palette slot a log bullet is tinted with, or `event` for
 *  match-level messages that belong to nobody's turn. */
export type LogEntryKind = 'p0' | 'p1' | 'p2' | 'p3' | 'event';

export interface LogEntry {
  id: number;
  text: string;
  /**
   * (P2) Which palette slot tints this entry's bullet in the sidebar log.
   *
   * This is a *colour* index, not a roster index. It used to be built as
   * `` `p${player}` `` from the dense roster position, which meant that in any
   * roster with a gap - slots [0, 2, 3], which is exactly what an online room
   * looks like after someone leaves - every player's bullets were tinted with
   * the wrong player's colour, directly contradicting the stated intent that a
   * log dot is "exactly the colour of that player's token".
   *
   * Keying on `colorId` makes it correct for sparse rosters, and makes the
   * `as any` casts unnecessary: a colour outside the palette now falls back to
   * `event` instead of producing an invisible bullet.
   */
  kind: LogEntryKind;
  /**
   * (G3) Wall-clock time the entry was created, for the sidebar log.
   * Kept separate from `text` on purpose: `text` feeds the screen-reader live
   * region, and a timestamp prefix there would make every announcement noisier.
   */
  at: number;
}

export interface UseGameOptions {
  isOnline?: boolean;
  isOnlineMatch?: boolean;
  isPaused?: boolean;
  isHost?: boolean;
  onlineSlot?: number;
  onLocalRoll?: (roll: number, player: number) => void;
  onTurnSettled?: (snapshot: GameStateSnapshot) => void;
}

/* (J5) Undulation kept when the OS asks for reduced motion: enough that the
 * snakes still read as snakes, not enough to undulate across a cell. The exact
 * same value has to reach the renderer and the slide sampler in the same frame,
 * or a sliding token would visibly detach from the body it is riding. */
const REDUCED_SNAKE_AMP = 0.35;

/* (P0) How long a guest waits for the host to answer a ROLL_REQUEST before
 * releasing its own latch. Generous enough to cover a slow-but-alive link and
 * a briefly backgrounded tab, tight enough that a dropped packet does not leave
 * a player staring at a dead button. The host now always *replies*
 * (ROLL_REJECTED), so this only fires when the reply itself is lost. */
const ROLL_REQUEST_TIMEOUT_MS = 8000;

/* (P0) Grace period added to a phase's expected duration before the watchdog
 * declares its timer lost and re-drives the completion.
 *
 * The slowest legitimate `settling` is turbo (120ms settle) and the slowest
 * `waiting` is normal-speed blocked-roll (320 + 650 = 970ms), so 2500ms is
 * comfortably more than 2x the worst case while still turning an infinite
 * freeze into a ~3s hiccup. */
const PHASE_WATCHDOG_GRACE_MS = 2500;

/* (P2) Beat of silence after a turn resolves before the next phase begins.
 *
 * These were bare `350` / `650` literals at their call sites. The two paths
 * differ on purpose: a lucky six that *moved* already had a full move or slide
 * animation to read, while a blocked roll (cannot move at 100 under the exact
 * rule) played nothing at all, so it gets a longer beat to make the "you stay
 * on the board" moment legible. Naming them makes the intent checkable, and
 * keeps them out of the arithmetic at the call sites. */
const LUCKY_SIX_EXTRA_PAUSE_MS = 350;
const BLOCKED_ROLL_EXTRA_PAUSE_MS = 650;

/**
 * (P0) A timer-driven turn completion in flight.
 *
 * `settle`  - a normal landing settled and owes `finishTurn(player, roll)`.
 * `lucky`   - a rolled 6 granted a bonus turn and owes `FINISH_LUCKY_SIX_WAIT`.
 * `pass`    - an exact-rule block owes `FINISH_PASS_WAIT`.
 */
type PendingTurn =
  | { kind: 'settle'; player: number; roll: number; txId: number; dueAt: number }
  | { kind: 'lucky'; player: number; txId: number; dueAt: number }
  | { kind: 'pass'; player: number; txId: number; dueAt: number };

function snakeAmpScale(): number {
  return prefersReducedMotion() ? REDUCED_SNAKE_AMP : 1;
}

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
  const gs = useRef<GameState>(initialGameState());
  const pendingCheckpoint = useRef<CheckpointData | null>(null);
  const lastStableSnapshot = useRef<GameStateSnapshot | null>(null);
  const boardLayer = useRef<HTMLCanvasElement | null>(null);
  const numberLayer = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef(0);
  const activeTimers = useRef<Map<string, { id: number; txId: number }>>(new Map());
  const uiTimers = useRef<Set<number>>(new Set());
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
  // Guest-only: true between sending ROLL_REQUEST and receiving the host's
  // authoritative ROLL_RESULT. Prevents spamming the host with roll requests.
  const [awaitingRemoteRoll, setAwaitingRemoteRoll] = useState(false);
  const awaitingRemoteRollRef = useRef(false);
  /* (P0) Watchdog for the latch above.
   *
   * This flag is what disables the roll button, and it used to be cleared in
   * exactly one place: receiving the host's ROLL_RESULT. The protocol had no
   * NACK, so if the host dropped the request for any reason - out of turn,
   * mid-animation, duplicate-suppressed, or a stale `turnId` because the guest
   * was a checkpoint behind - the guest set this to `true` and nothing ever
   * cleared it. The button stayed dead for the rest of the match, with no
   * timeout and no recovery short of a page reload.
   *
   * The host now answers every rejection with ROLL_REJECTED (see
   * `useMultiplayer`), but a reliable answer on an unreliable transport is not
   * a guarantee: a ROLL_REJECTED can itself be dropped. This timer makes the
   * latch self-healing regardless of what the host does or fails to do. */
  const rollRequestTimerRef = useRef<number | null>(null);
  /* (P0) Describes the timer-driven turn completion currently in flight.
   *
   * `settling` and `waiting` are each advanced by exactly one `setTimeout`. If
   * that timer is lost - cancelled by `cancelObsoleteTimers`, swallowed by a
   * tab that was throttled past its own deadline, or dropped because a
   * checkpoint reordered `applyCheckpoint` - the phase had no second advancer
   * and no watchdog, so the match froze on that turn permanently. The closure
   * arguments of the lost timer are the only record of what it was going to do,
   * so they are mirrored here where a watchdog can re-drive them. */
  const pendingTurnRef = useRef<PendingTurn | null>(null);
  const [showWin, setShowWin] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'restart' | 'menu' | null>(null);
  const [hoveredSquare, setHoveredSquare] = useState<number | undefined>(undefined);
  const [themeId, setThemeIdState] = useState<ThemeId>(() => getSavedTheme());
  const themeRef = useRef<BoardTheme>(THEMES[themeId] || THEMES.jungle);
  themeRef.current = THEMES[themeId] || THEMES.jungle;

  const setAwaitingRoll = useCallback(
    (v: boolean) => {
      awaitingRemoteRollRef.current = v;
      setAwaitingRemoteRoll(v);
      /* (P0) Every release of the latch also disarms the watchdog, so the timer
       * can never fire against a latch that has already been cleared. This is
       * the single choke point: startGame, backToMenu, applyCheckpoint,
       * reconnectGame, doRemoteRoll and the NACK handler all go through it. */
      if (!v && rollRequestTimerRef.current !== null) {
        window.clearTimeout(rollRequestTimerRef.current);
        rollRequestTimerRef.current = null;
      }
    },
    [],
  );

  const setTheme = useCallback((id: ThemeId) => {
    if (!THEMES[id]) return;
    saveTheme(id);
    themeRef.current = THEMES[id];
    setThemeIdState(id);
  }, []);

  /* (J5) The confetti + firework shower is by far the largest burst of motion
   * in the game and covers the entire board, which is precisely what
   * `prefers-reduced-motion` asks us to drop. The win moment still has its
   * toast, its landing rings, the podium beacon and the winner modal - only the
   * full-screen shower is skipped. Also collapses the six duplicated spawn
   * calls this used to take. */
  const celebrate = useCallback((ps: Particle[], cx: number, cy: number) => {
    if (prefersReducedMotion()) return;
    spawnConfetti(ps, themeRef.current.ui.celebrate);
    spawnFirework(ps, cx, cy, themeRef.current.ui.celebrate);
  }, []);

  /* (P2) Cancel game timers.
   *
   * Called with no argument on teardown paths (start / menu / reconnect / an
   * incoming checkpoint), which cancels everything - that is the intent, since
   * a new match or an authoritative state must not leave an old turn's timer
   * running.
   *
   * The `currentTxId` parameter was previously accepted and then never passed
   * by any caller, so its selective branch was dead code that read as if
   * per-turn timers were being protected. The parameter is kept because
   * `scheduleGameTimer` already stamps every timer with a `txId` and the
   * selective form is the correct thing to reach for when cancelling on behalf
   * of a *specific* in-flight transaction; the call sites below simply do not
   * have such a case. Deleting an unused-but-meaningful parameter would be
   * worse than documenting it. */
  const cancelObsoleteTimers = useCallback((currentTxId?: number) => {
    activeTimers.current.forEach((val, name) => {
      if (currentTxId === undefined || val.txId !== currentTxId) {
        window.clearTimeout(val.id);
        activeTimers.current.delete(name);
      }
    });
  }, []);

  const clearAllTimers = useCallback(() => {
    activeTimers.current.forEach((val) => window.clearTimeout(val.id));
    activeTimers.current.clear();
    uiTimers.current.forEach((t) => window.clearTimeout(t));
    uiTimers.current.clear();
  }, []);

  useEffect(() => clearAllTimers, [clearAllTimers]);

  const scheduleUiTimer = useCallback((ms: number, fn: () => void) => {
    const t = window.setTimeout(() => {
      uiTimers.current.delete(t);
      fn();
    }, ms);
    uiTimers.current.add(t);
    return t;
  }, []);

  const clearHover = useCallback(() => {
    gs.current.hoveredSquare = undefined;
    setHoveredSquare(undefined);
  }, []);

  const dispatch = useCallback((action: GameAction) => {
    const prevState = gs.current;
    const nextState = gameReducer(prevState, action);
    gs.current = nextState;

    setHud((prev) => ({
      ...prev,
      mode: nextState.mode,
      phase: nextState.phase,
      players: nextState.players,
      turn: nextState.turn,
      pos: [...nextState.pos],
      roll: nextState.roll,
      rolling: nextState.rolling,
      winner: nextState.winner,
      rolls: [...nextState.rolls],
      laddersHit: [...nextState.laddersHit],
      snakesHit: [...nextState.snakesHit],
      sixesHit: [...nextState.sixesHit],
      speed: nextState.speed,
      winRule: nextState.winRule,
      targetSquare: nextState.targetSquare,
      hoveredSquare: nextState.hoveredSquare,
    }));

    return nextState;
  }, []);

  const scheduleGameTimer = useCallback(
    (name: string, ms: number, expectedPhase: Phase, callback: () => void) => {
      const existing = activeTimers.current.get(name);
      if (existing) {
        window.clearTimeout(existing.id);
      }
      const txId = gs.current.txId;
      const t = window.setTimeout(() => {
        activeTimers.current.delete(name);
        if (gs.current.txId !== txId || gs.current.phase !== expectedPhase) {
          if (name === 'roll' && gs.current.rolling) {
            dispatch({ type: 'CLEAR_ROLLING' });
          }
          return;
        }
        callback();
      }, ms);
      activeTimers.current.set(name, { id: t, txId });
      return t;
    },
    [dispatch],
  );

  const recordStableSnapshot = useCallback((state: GameState): GameStateSnapshot => {
    const checkpointMode: CheckpointMode =
      state.winner >= 0 || state.mode === 'over'
        ? 'over'
        : state.mode === 'playing'
        ? 'playing'
        : 'idle';

    const snap: GameStateSnapshot = {
      mode: checkpointMode,
      pos: [...state.pos],
      turn: state.turn,
      phase: state.winner >= 0 || state.mode === 'over' ? 'over' : 'idle',
      rolls: [...state.rolls],
      laddersHit: [...state.laddersHit],
      snakesHit: [...state.snakesHit],
      sixesHit: [...state.sixesHit],
      winner: state.winner,
      isPlaying: state.mode === 'playing',
    };
    lastStableSnapshot.current = snap;
    return snap;
  }, []);

  const playerName = useCallback((p: number) => {
    const g = gs.current;
    return g.players[p]?.name ?? `Player ${p + 1}`;
  }, []);

  /* (P2) The single safe palette accessor.
   *
   * The draw loop used to index `PLAYER_COLORS` raw in four places
   * (`PLAYER_COLORS[colorId]`) while this helper correctly used a modulo. A
   * `colorId` of 4 or more - reachable via a session blob, a peer roster or a
   * future call that lifts the 4-player cap - would return `undefined` and then
   * throw on `.base` *inside the rAF loop*, which kills the render loop for the
   * rest of the session: a frozen board with no way to recover short of a
   * reload. `render.ts` already used the modulo form; this makes the engine
   * match, and the modulo is the last line of defence for a bad `colorId`. */
  const playerPalette = useCallback((p: number): PlayerPalette => {
    const g = gs.current;
    const raw = g.players[p]?.colorId;
    const colorId =
      typeof raw === 'number' && Number.isFinite(raw) && raw >= 0
        ? Math.floor(raw) % PLAYER_COLORS.length
        : p % PLAYER_COLORS.length;
    return PLAYER_COLORS[colorId];
  }, []);

  /* (P2) Resolve a roster index to the log bullet colour for that player.
   *
   * Uses the player's `colorId` (their actual palette) rather than their
   * position in the roster, so a sparse online roster tints every bullet with
   * the right colour. An out-of-range or missing player degrades to `event`
   * instead of producing an invisible bullet from an `undefined` lookup. */
  const logKindFor = useCallback((player: number): LogEntryKind => {
    const g = gs.current;
    const colorId = g.players[player]?.colorId;
    if (typeof colorId !== 'number' || colorId < 0 || colorId > 3) return 'event';
    return `p${colorId}` as LogEntryKind;
  }, []);

  const pushLog = useCallback((text: string, kind: LogEntryKind) => {
    logId.current += 1;
    const id = logId.current;
    setLog((l) => [{ id, text, kind, at: Date.now() }, ...l].slice(0, 20));
  }, []);

  /** Arm the guest's roll-request watchdog. Cleared on any ROLL_RESULT,
   *  ROLL_REJECTED, checkpoint, disconnect or local teardown. */
  const armRollRequestWatchdog = useCallback(() => {
    if (rollRequestTimerRef.current !== null) {
      window.clearTimeout(rollRequestTimerRef.current);
    }
    rollRequestTimerRef.current = window.setTimeout(() => {
      rollRequestTimerRef.current = null;
      if (!awaitingRemoteRollRef.current) return;
      /* The host did not answer in time. Release the latch so the player can
       * try again rather than staring at a dead button, and say so - a silent
       * release would look like the app ignored the tap. */
      awaitingRemoteRollRef.current = false;
      setAwaitingRemoteRoll(false);
      pushLog('⚠️ The host did not answer that roll in time — tap Roll to try again.', 'event');
    }, ROLL_REQUEST_TIMEOUT_MS);
  }, [pushLog]);

  const showToast = useCallback(
    (title: string, sub: string | undefined, kind: Toast['kind']) => {
      toastId.current += 1;
      const id = toastId.current;
      setToast({ id, title, sub, kind });
      scheduleUiTimer(1600, () => setToast((t) => (t && t.id === id ? null : t)));
    },
    [scheduleUiTimer],
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

    // (F3) The board is drawn in a fixed 1040px logical space then scaled to
    // fit, so on a 900px desktop board every label is scaled down ~0.86 and
    // starts to look cramped. Nudge only the *font* sizes up as the board
    // grows, clamped tightly so typical sizes are unchanged.
    const cssSize = sizeRef.current || 640;
    const fontScale = Math.max(1, Math.min(1.12, cssSize / 780));

    /* (P2) Build the new layers, swap them in, then release the old ones.
     *
     * Each layer is a full-resolution offscreen canvas - ~16.8 MB at the pixel
     * budget - and a re-bake replaces both. Zeroing the outgoing canvases'
     * dimensions after the swap frees those buffers immediately instead of
     * leaving two of them to the collector on every bake.
     *
     * Order matters: the references are replaced *before* the old canvases are
     * resized, so the draw loop can never observe a null layer even for a
     * single frame. */
    const prevBoard = boardLayer.current;
    const prevNumber = numberLayer.current;

    // 1. Static base board layer
    const c1 = document.createElement('canvas');
    c1.width = canvas.width;
    c1.height = canvas.height;
    const ctx1 = c1.getContext('2d');
    if (ctx1) {
      const s = c1.width / LOGICAL;
      ctx1.setTransform(s, 0, 0, s, 0, 0);
      drawStaticBoard(ctx1, currentTheme, gs.current.players, fontScale);
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
      drawBoardBadgesAndNumbers(ctx2, currentTheme, fontScale);
      numberLayer.current = c2;
    }

    // Release the outgoing buffers only once the replacements are live.
    if (prevBoard && prevBoard !== c1) {
      prevBoard.width = 0;
      prevBoard.height = 0;
    }
    if (prevNumber && prevNumber !== c2) {
      prevNumber.width = 0;
      prevNumber.height = 0;
    }
  }, []);

  useEffect(() => {
    renderBoardLayer(THEMES[themeId] || THEMES.jungle);
  }, [themeId, renderBoardLayer]);

  /* (V3) Re-bake when the Start Bay's docking dishes go stale.
   *
   * `drawStaticBoard` bakes the four P1..P4 dish rings from the player roster
   * (`players[idx].colorId`), but the board layer was only ever re-rasterised on
   * theme change, game start, resize and web-font load. So when a player took a
   * reserved seat or switched colour in the online lobby, their dish kept the
   * *previous* colour until the window happened to be resized.
   *
   * Keyed on the slot -> colour mapping itself rather than on `hud.players`, so
   * it costs one re-bake only when that mapping genuinely changes and never
   * during ordinary play (positions and names are deliberately not part of the
   * signature - the dishes do not draw either).
   *
   * Safe to read `gs.current` here: `dispatch` assigns `gs.current` before it
   * calls `setHud`, so by the time this effect runs the roster is already
   * current. `renderBoardLayer` also no-ops when the canvas is missing or
   * unsized, which is the case in the menu. */
  const dockSignature = hud.players.map((p) => `${p.slotIndex}:${p.colorId}`).join(',');
  useEffect(() => {
    renderBoardLayer();
  }, [dockSignature, renderBoardLayer]);

  /* ---------- game flow ---------- */

  const startGame = useCallback(
    (
      players: PlayerConfig[] = defaultPlayers,
      speed: GameSpeed = 'normal',
      winRule: WinRule = 'exact',
    ) => {
      cancelObsoleteTimers();
      clearHover();
      pendingCheckpoint.current = null;
      pendingTurnRef.current = null;
      setAwaitingRoll(false);

      const nextState = dispatch({
        type: 'START_GAME',
        players,
        speed,
        winRule,
      });

      recordStableSnapshot(nextState);
      renderBoardLayer();

      setLog([]);
      setShowWin(false);
      setConfirmAction(null);
      sfx.click();

      const p0Name = players[0]?.name ?? 'Player 1';
      showToast(`${p0Name.toUpperCase()} STARTS`, 'Roll the dice to begin!', 'cyan');
      pushLog(`Match started — ${p0Name} has the opening turn!`, 'event');
    },
    [cancelObsoleteTimers, clearHover, dispatch, pushLog, recordStableSnapshot, renderBoardLayer, setAwaitingRoll, showToast],
  );

  const backToMenu = useCallback(() => {
    cancelObsoleteTimers();
    clearHover();
    pendingCheckpoint.current = null;
    pendingTurnRef.current = null;
    setAwaitingRoll(false);
    dispatch({ type: 'BACK_TO_MENU' });
    setShowWin(false);
    setToast(null);
    setConfirmAction(null);
    sfx.click();
  }, [cancelObsoleteTimers, clearHover, dispatch, setAwaitingRoll]);

  /* Apply authoritative checkpoint from host (Requirement 3) */
  const applyCheckpoint = useCallback(
    (checkpoint: CheckpointData) => {
      /* 1. Cancel obsolete timers when a checkpoint supersedes local state (Requirement 5)
       *
       * (P0) `pendingTurnRef` is cleared *before* the dispatch, not after.
       *
       * `APPLY_CHECKPOINT` rejects non-stable phases and returns the state
       * unchanged. Clearing the timers first therefore meant a checkpoint that
       * arrived mid-`settling` destroyed the turn's only advancer and left the
       * phase exactly where it was - a permanent freeze with no error. Now the
       * descriptor is dropped only once we know the checkpoint was actually
       * applied, and the phase watchdog covers the gap if it was not. */
      cancelObsoleteTimers();
      pendingCheckpoint.current = null;
      // An authoritative checkpoint supersedes any outstanding roll request.
      setAwaitingRoll(false);

      const wasOver = gs.current.mode === 'over';

      // 2. Apply host checkpoint through the authoritative reducer
      const nextState = dispatch({
        type: 'APPLY_CHECKPOINT',
        checkpoint,
      });

      if (nextState.phase !== 'settling' && nextState.phase !== 'waiting') {
        pendingTurnRef.current = null;
      }

      if (isStablePhase(nextState.phase)) {
        recordStableSnapshot(nextState);
      }

      // 3. Fix winner synchronization so both gs.mode and hud.mode become over (Requirement 7)
      if (nextState.mode === 'over' && nextState.winner >= 0) {
        if (!wasOver) {
          pushLog(
            `🏆 ${playerName(nextState.winner)} conquered square 100 and WON THE GAME!`,
            'event',
          );
          sfx.win();
          celebrate(nextState.particles, 520, 200);

          scheduleUiTimer(500, () => {
            if (gs.current.mode === 'over') {
              celebrate(gs.current.particles, 300, 300);
            }
          });
          scheduleUiTimer(1100, () => {
            if (gs.current.mode === 'over') {
              celebrate(gs.current.particles, 740, 260);
            }
          });
          scheduleUiTimer(1500, () => {
            if (gs.current.mode === 'over') {
              setShowWin(true);
            }
          });
        } else {
          setShowWin(true);
        }
      }
    },
    [cancelObsoleteTimers, celebrate, dispatch, playerName, pushLog, recordStableSnapshot, scheduleUiTimer, setAwaitingRoll],
  );

  const switchTurn = useCallback(
    (fromPlayer?: number) => {
      const nextState = dispatch({
        type: 'SWITCH_TURN',
        fromPlayer,
      });

      const snap = recordStableSnapshot(nextState);
      const { isOnline, isHost, onTurnSettled } = optionsRef.current;
      if (isOnline && isHost) {
        onTurnSettled?.(snap);
      }

      // If a checkpoint arrived during this turn's animation, safely reconcile now
      if (pendingCheckpoint.current) {
        const cp = pendingCheckpoint.current;
        pendingCheckpoint.current = null;
        applyCheckpoint(cp);
      }
    },
    [applyCheckpoint, dispatch, recordStableSnapshot],
  );

  const finishTurn = useCallback(
    (player: number, v: number, txId: number) => {
      const g = gs.current;
      if (g.mode !== 'playing') return;

      if (g.pos[player] === 100) {
        const nextState = dispatch({
          type: 'GAME_OVER',
          winner: player,
          txId,
        });

        pushLog(`🏆 ${playerName(player)} conquered square 100 and WON THE GAME!`, 'event');
        sfx.win();
        celebrate(nextState.particles, 520, 200);

        scheduleUiTimer(500, () => {
          if (gs.current.mode === 'over') {
            celebrate(gs.current.particles, 300, 300);
          }
        });
        scheduleUiTimer(1100, () => {
          if (gs.current.mode === 'over') {
            celebrate(gs.current.particles, 740, 260);
          }
        });
        scheduleUiTimer(1500, () => {
          if (gs.current.mode === 'over') {
            setShowWin(true);
          }
        });

        if (pendingCheckpoint.current) {
          pendingCheckpoint.current = null;
        }

        const snap = recordStableSnapshot(nextState);
        const { isOnline, isHost, onTurnSettled } = optionsRef.current;
        if (isOnline && isHost) {
          onTurnSettled?.(snap);
        }
        return;
      }

      if (v === 6) {
        dispatch({
          type: 'START_LUCKY_SIX_WAIT',
          txId,
          player,
        });
        showToast('LUCKY SIX!', `${playerName(player)} earns an extra roll!`, 'gold');
        sfx.ding();
        const cfg = SPEEDS[g.speed];

        scheduleGameTimer('waiting', cfg.settleMs + LUCKY_SIX_EXTRA_PAUSE_MS, 'waiting', () => {
          const nextState = dispatch({
            type: 'FINISH_LUCKY_SIX_WAIT',
            txId,
            expectedPhase: 'waiting',
            player,
          });

          pendingTurnRef.current = null;

          const snap = recordStableSnapshot(nextState);
          const { isOnline, isHost, onTurnSettled } = optionsRef.current;
          if (isOnline && isHost) {
            onTurnSettled?.(snap);
          }

          if (pendingCheckpoint.current) {
            const cp = pendingCheckpoint.current;
            pendingCheckpoint.current = null;
            applyCheckpoint(cp);
          }
        });

        /* (P0) Mirror the closure for `phaseWatchdog`. */
        pendingTurnRef.current = {
          kind: 'lucky',
          player,
          txId,
          dueAt: performance.now() + cfg.settleMs + LUCKY_SIX_EXTRA_PAUSE_MS + PHASE_WATCHDOG_GRACE_MS,
        };
      } else {
        switchTurn(player);
      }
    },
    [
      applyCheckpoint,
      celebrate,
      dispatch,
      playerName,
      pushLog,
      recordStableSnapshot,
      scheduleGameTimer,
      scheduleUiTimer,
      showToast,
      switchTurn,
    ],
  );

  const afterMove = useCallback(
    (player: number, target: number, v: number, txId: number) => {
      const g = gs.current;
      const portal = PORTALS[target];
      const cfg = SPEEDS[g.speed];

      if (portal?.type === 'ladder') {
        const up = portal.to;
        const pts = LADDER_PATHS[target];
        const { cum, total } = pathCum(pts);
        const sliding: Sliding = {
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
        dispatch({
          type: 'START_SLIDE',
          txId,
          player,
          sliding,
        });
        showToast('GOLDEN LADDER!', `Climbing ${target} ➔ ${up}!`, 'gold');
        pushLog(
          `🪜 ${playerName(player)} caught a ladder: ${target} ➔ ${up}`,
          logKindFor(player),
        );
        sfx.ladder();
      } else if (portal?.type === 'snake') {
        const down = portal.to;
        const pts = SNAKE_PATHS[target];
        const { cum, total } = pathCum(pts);
        const sliding: Sliding = {
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
        dispatch({
          type: 'START_SLIDE',
          txId,
          player,
          sliding,
        });
        showToast('SNAKE BITE!', `Slithering down ${target} ➔ ${down}!`, 'red');
        pushLog(
          `🐍 ${playerName(player)} was bitten by a snake: ${target} ➔ ${down}`,
          logKindFor(player),
        );
        sfx.snake();
      } else {
        // Normal square landing settle phase
        dispatch({
          type: 'START_SETTLING',
          txId,
          player,
        });
        sfx.land();
        const c = squareCenter(target);
        spawnDust(g.particles, c.x, c.y);

        scheduleGameTimer('settle', cfg.settleMs, 'settling', () => {
          dispatch({
            type: 'SETTLE_COMPLETE',
            txId,
            expectedPhase: 'settling',
            player,
            roll: v,
          });
          pendingTurnRef.current = null;
          finishTurn(player, v, txId);
        });
        /* (P0) Mirror the closure so `phaseWatchdog` can re-drive this if the
         * timer is ever lost. */
        pendingTurnRef.current = {
          kind: 'settle',
          player,
          roll: v,
          txId,
          dueAt: performance.now() + cfg.settleMs + PHASE_WATCHDOG_GRACE_MS,
        };
      }
    },
    [dispatch, finishTurn, playerName, pushLog, scheduleGameTimer, showToast],
  );

  const resolveRoll = useCallback(
    (player: number, v: number, txId: number) => {
      const g = gs.current;
      const pos = g.pos[player];

      if (pos + v > 100) {
        if (g.winRule === 'bounce') {
          // Bounce back rule
          const overshoot = pos + v - 100;
          const bounceTarget = 100 - overshoot;
          const steps: Pt[] = [];

          for (let s = pos + 1; s <= 100; s++) steps.push(squareCenter(s));
          for (let s = 99; s >= bounceTarget; s--) steps.push(squareCenter(s));

          showToast('BOUNCED BACK!', `Overshot 100 ➔ bounced to ${bounceTarget}`, 'pink');
          sfx.buzz();
          pushLog(
            `↩️ ${playerName(player)} overshot 100 and bounced back to square ${bounceTarget}`,
            'event',
          );

          dispatch({
            type: 'START_MOVE',
            txId,
            player,
            steps,
            target: bounceTarget,
            roll: v,
          });
          return;
        } else {
          // Exact roll required
          if (v === 6) {
            dispatch({
              type: 'START_LUCKY_SIX_WAIT',
              txId,
              player,
            });
            showToast('LUCKY SIX!', `Can't move (need ${100 - pos}), but ${playerName(player)} earns an extra roll!`, 'gold');
            pushLog(
              `🎲 ${playerName(player)} rolled a 6 on square ${pos} (needs ${100 - pos}) — earns an extra roll!`,
              'event',
            );
            sfx.ding();
            const cfg = SPEEDS[g.speed];

            scheduleGameTimer('waiting', cfg.settleMs + BLOCKED_ROLL_EXTRA_PAUSE_MS, 'waiting', () => {
              const nextState = dispatch({
                type: 'FINISH_LUCKY_SIX_WAIT',
                txId,
                expectedPhase: 'waiting',
                player,
              });

              pendingTurnRef.current = null;

              const snap = recordStableSnapshot(nextState);
              const { isOnline, isHost, onTurnSettled } = optionsRef.current;
              if (isOnline && isHost) {
                onTurnSettled?.(snap);
              }

              if (pendingCheckpoint.current) {
                const cp = pendingCheckpoint.current;
                pendingCheckpoint.current = null;
                applyCheckpoint(cp);
              }
            });

            /* (P0) Mirror the closure for `phaseWatchdog`. */
            pendingTurnRef.current = {
              kind: 'lucky',
              player,
              txId,
              dueAt:
                performance.now() +
                cfg.settleMs +
                BLOCKED_ROLL_EXTRA_PAUSE_MS +
                PHASE_WATCHDOG_GRACE_MS,
            };
            return;
          }

          // Exact roll required (not a 6)
          dispatch({
            type: 'START_PASS_WAIT',
            txId,
            player,
          });
          showToast('NEED EXACT ROLL', `Must land on 100 exactly (need ${100 - pos})`, 'info');
          pushLog(
            `⚠️ ${playerName(player)} needs exactly ${100 - pos} to win — turn passed`,
            'event',
          );
          sfx.buzz();
          const cfg = SPEEDS[g.speed];

          scheduleGameTimer('waiting', cfg.settleMs + BLOCKED_ROLL_EXTRA_PAUSE_MS, 'waiting', () => {
            const nextState = dispatch({
              type: 'FINISH_PASS_WAIT',
              txId,
              expectedPhase: 'waiting',
              player,
            });

            pendingTurnRef.current = null;

            const snap = recordStableSnapshot(nextState);
            const { isOnline, isHost, onTurnSettled } = optionsRef.current;
            if (isOnline && isHost) {
              onTurnSettled?.(snap);
            }

            if (pendingCheckpoint.current) {
              const cp = pendingCheckpoint.current;
              pendingCheckpoint.current = null;
              applyCheckpoint(cp);
            }
          });

          /* (P0) Mirror the closure for `phaseWatchdog`. */
          pendingTurnRef.current = {
            kind: 'pass',
            player,
            txId,
            dueAt:
              performance.now() +
              cfg.settleMs +
              BLOCKED_ROLL_EXTRA_PAUSE_MS +
              PHASE_WATCHDOG_GRACE_MS,
          };
          return;
        }
      }

      const target = pos + v;
      const steps: Pt[] = [];
      for (let s = pos + 1; s <= target; s++) steps.push(squareCenter(s));

      dispatch({
        type: 'START_MOVE',
        txId,
        player,
        steps,
        target,
        roll: v,
      });
    },
    [
      applyCheckpoint,
      dispatch,
      playerName,
      pushLog,
      recordStableSnapshot,
      scheduleGameTimer,
      showToast,
    ],
  );

  /* ---------- (P0) Phase watchdog ----------
   *
   * `settling` and `waiting` are the only two phases advanced by a single
   * `setTimeout` with no second path out. If that timer is lost the match is
   * frozen on that turn forever: `canRoll` requires `idle`, and the CPU driver
   * is gated on `idle` too, so nothing - human or bot - can advance it.
   *
   * The realistic way to lose it is ordering, not bad luck. `applyCheckpoint`
   * calls `cancelObsoleteTimers()` *before* dispatching `APPLY_CHECKPOINT`, and
   * the reducer then rejects the checkpoint for any non-stable phase and
   * returns the state unchanged. Net result: timer destroyed, phase unchanged,
   * no way out. Today every `applyCheckpoint` call site happens to be
   * phase-stable, so this is a latent trap rather than a live freeze - but it
   * is a one-line-ordering mistake away from ending a match, and a frozen
   * board is indistinguishable from a hung app to a player.
   *
   * This effect watches for exactly that condition and re-drives the completion
   * from the mirrored `PendingTurn` descriptor. It is a safety net, not the
   * normal path: a healthy turn clears `pendingTurnRef` and the watchdog never
   * fires.
   */
  useEffect(() => {
    const phase = hud.phase;
    if (hud.mode !== 'playing' || (phase !== 'settling' && phase !== 'waiting')) {
      // Not a watchdog-guarded phase: drop any stale descriptor.
      if (phase !== 'settling' && phase !== 'waiting') pendingTurnRef.current = null;
      return;
    }

    const pending = pendingTurnRef.current;
    if (!pending) return;

    const fire = () => {
      const current = pendingTurnRef.current;
      // Already completed normally, or superseded by a newer turn.
      if (!current || current !== pending) return;
      const g = gs.current;
      // A newer transaction or a different phase means real progress.
      if (g.txId !== pending.txId) {
        pendingTurnRef.current = null;
        return;
      }
      if (g.phase !== phase) {
        pendingTurnRef.current = null;
        return;
      }
      if (g.mode !== 'playing') {
        pendingTurnRef.current = null;
        return;
      }

      pendingTurnRef.current = null;
      console.warn(
        `[useGame] (P0) phase watchdog recovered a stuck "${phase}" turn for ${g.players[pending.player]?.name ?? 'player'}`,
      );
      pushLog('⏱️ Recovered a stalled turn — play continues.', 'event');

      if (pending.kind === 'settle') {
        dispatch({
          type: 'SETTLE_COMPLETE',
          txId: pending.txId,
          expectedPhase: 'settling',
          player: pending.player,
          roll: pending.roll,
        });
        finishTurn(pending.player, pending.roll, pending.txId);
        return;
      }

      if (pending.kind === 'lucky') {
        const nextState = dispatch({
          type: 'FINISH_LUCKY_SIX_WAIT',
          txId: pending.txId,
          expectedPhase: 'waiting',
          player: pending.player,
        });
        const snap = recordStableSnapshot(nextState);
        const { isOnline, isHost, onTurnSettled } = optionsRef.current;
        if (isOnline && isHost) onTurnSettled?.(snap);
        return;
      }

      const nextState = dispatch({
        type: 'FINISH_PASS_WAIT',
        txId: pending.txId,
        expectedPhase: 'waiting',
        player: pending.player,
      });
      const snap = recordStableSnapshot(nextState);
      const { isOnline, isHost, onTurnSettled } = optionsRef.current;
      if (isOnline && isHost) onTurnSettled?.(snap);
    };

    /* Never judge a hidden tab. Browsers clamp timers in background tabs, so
     * both the real completion timer and this one would be deferred together
     * and their relative order is not guaranteed. Suspend while hidden and
     * re-check the moment the player comes back. */
    if (typeof document !== 'undefined' && document.hidden) {
      const onVisible = () => {
        if (document.hidden) return;
        // The elapsed time is what matters, not the timer: if the deadline has
        // already passed, recover immediately.
        if (performance.now() >= pending.dueAt) fire();
      };
      document.addEventListener('visibilitychange', onVisible);
      return () => document.removeEventListener('visibilitychange', onVisible);
    }

    const remaining = Math.max(0, pending.dueAt - performance.now());
    const id = window.setTimeout(fire, remaining);
    return () => window.clearTimeout(id);
  }, [
    hud.phase,
    hud.mode,
    dispatch,
    finishTurn,
    pushLog,
    recordStableSnapshot,
  ]);

  const doRoll = useCallback(
    (isAI = false) => {
      if (gs.current.mode !== 'playing') return;

      // Self-heal: If rolling flag is stuck but no roll timer is executing, clear it.
      // NOTE: `dispatch` replaces `gs.current` with a NEW object, so the live state
      // must be re-read afterwards — otherwise the guard below reads the pre-heal
      // snapshot and bails out, leaving the roll button permanently dead.
      if (gs.current.rolling && !activeTimers.current.has('roll')) {
        dispatch({ type: 'CLEAR_ROLLING' });
      }

      const g = gs.current;
      if (g.phase !== 'idle' || g.rolling) return;

      const { isOnline, isOnlineMatch, isPaused, isHost, onlineSlot, onLocalRoll } = optionsRef.current;
      if (isPaused) return;
      if (isOnlineMatch && !isOnline) return;

      const currPlayer = g.players[g.turn];
      if (currPlayer?.isCpu && !isAI) return;

      // In online mode, human player can only roll on their assigned slot
      if (isOnline && !currPlayer?.isCpu && currPlayer?.slotIndex !== onlineSlot) return;

      // In online mode, guest asks host for authoritative roll.
      // Guard against spamming the host while a request is already in flight.
      if (isOnline && !isHost) {
        if (awaitingRemoteRollRef.current) return;
        setAwaitingRoll(true);
        /* (P0) Arm the watchdog: if the host never answers - for any reason,
         * including a lost ROLL_REJECTED - the latch releases itself instead of
         * leaving the roll button permanently dead. */
        armRollRequestWatchdog();
        onLocalRoll?.(0, currPlayer?.slotIndex ?? g.turn);
        return;
      }

      const activeTurn = g.turn;
      const v = 1 + Math.floor(Math.random() * 6);

      // Start roll via reducer (increments txId!)
      const nextState = dispatch({
        type: 'START_ROLL',
        player: activeTurn,
        roll: v,
      });

      // Broadcast to network if online
      if (isOnline) {
        onLocalRoll?.(v, currPlayer?.slotIndex ?? activeTurn);
      }

      sfx.roll();
      const cfg = SPEEDS[nextState.speed];

      scheduleGameTimer('roll', cfg.rollMs, 'rolling', () => {
        dispatch({
          type: 'ROLL_LANDED',
          txId: nextState.txId,
          expectedPhase: 'rolling',
          player: activeTurn,
          roll: v,
        });

        // Log the roll precisely when it lands!
        pushLog(
          `🎲 ${playerName(activeTurn)} rolled a ${v}`,
          logKindFor(activeTurn),
        );

        resolveRoll(activeTurn, v, nextState.txId);
      });
    },
    [dispatch, playerName, pushLog, resolveRoll, scheduleGameTimer, setAwaitingRoll],
  );

  /* Trigger roll coming from a remote network peer */
  const doRemoteRoll = useCallback(
    (v: number, playerSlotIndex?: number) => {
      if (gs.current.mode !== 'playing') return;

      // Self-heal: clear a stuck rolling flag (re-read live state after dispatch)
      if (gs.current.rolling && !activeTimers.current.has('roll')) {
        dispatch({ type: 'CLEAR_ROLLING' });
      }

      const g = gs.current;
      // The host broadcasts slot indexes, never dense roster indexes. Resolving via
      // `slotToIndex` only avoids moving the wrong token for sparse rosters
      // (e.g. slots [0,2,3] where slot 2 must not be read as roster index 2).
      let activeTurn = g.turn;
      if (typeof playerSlotIndex === 'number') {
        const idx = slotToIndex(playerSlotIndex, g.players);
        if (idx >= 0) {
          activeTurn = idx;
        } else if (playerSlotIndex >= 0 && playerSlotIndex < g.players.length) {
          activeTurn = playerSlotIndex;
        }
      }

      // The authoritative roll arrived: stop waiting on the host.
      setAwaitingRoll(false);

      // Start roll via reducer (increments txId!)
      const nextState = dispatch({
        type: 'START_ROLL',
        player: activeTurn,
        roll: v,
      });

      sfx.roll();
      const cfg = SPEEDS[nextState.speed];

      scheduleGameTimer('roll', cfg.rollMs, 'rolling', () => {
        dispatch({
          type: 'ROLL_LANDED',
          txId: nextState.txId,
          expectedPhase: 'rolling',
          player: activeTurn,
          roll: v,
        });

        pushLog(
          `🎲 ${playerName(activeTurn)} rolled a ${v}`,
          logKindFor(activeTurn),
        );

        resolveRoll(activeTurn, v, nextState.txId);
      });
    },
    [dispatch, logKindFor, playerName, pushLog, resolveRoll, scheduleGameTimer, setAwaitingRoll],
  );

  /**
   * Live roll authority for the host.
   *
   * `getSnapshot()` intentionally reports the last *stable* checkpoint (so
   * reconnecting peers never observe half-finished animations), which means its
   * `phase` reads `idle` even while a turn is still resolving. The host must
   * therefore use this live view to reject duplicate / out-of-turn ROLL_REQUESTs.
   */
  const getRollAuthority = useCallback(() => {
    const g = gs.current;
    const activePlayer = g.players[g.turn];
    if (!activePlayer) return undefined;
    return {
      turnSlot: activePlayer.slotIndex,
      isPlaying: g.mode === 'playing',
      isAwaitingRoll: g.mode === 'playing' && g.phase === 'idle' && !g.rolling,
    };
  }, []);

  /* Synchronize full game state from authoritative host checkpoint */
  const syncFromCheckpoint = useCallback(
    (checkpoint: CheckpointData) => {
      const g = gs.current;

      // 1. Reject duplicate or out-of-order state versions
      if (
        checkpoint.stateVersion !== undefined &&
        g.stateVersion !== undefined &&
        checkpoint.stateVersion <= g.stateVersion
      ) {
        return;
      }

      const isTerminal = isTerminalCheckpoint(checkpoint);
      const isStable = isStablePhase(g.phase);

      // 2. Requirement 4: Defer or reject checkpoints during every non-stable phase, including settling and waiting
      if (!isTerminal && !isStable) {
        if (
          !pendingCheckpoint.current ||
          (checkpoint.stateVersion ?? 0) >= (pendingCheckpoint.current.stateVersion ?? 0)
        ) {
          pendingCheckpoint.current = checkpoint;
        }
        return;
      }

      applyCheckpoint(checkpoint);
    },
    [applyCheckpoint],
  );

  /* Reconnect safely from stable state (Requirement 9) */
  const reconnectGame = useCallback(
    (
      players: PlayerConfig[],
      speed: GameSpeed,
      winRule: WinRule,
      checkpoint?: CheckpointData,
    ) => {
      cancelObsoleteTimers();
      pendingCheckpoint.current = null;
      pendingTurnRef.current = null;
      setAwaitingRoll(false);

      const nextState = dispatch({
        type: 'RECONNECT',
        players,
        speed,
        winRule,
        checkpoint,
      });

      recordStableSnapshot(nextState);

      if (nextState.mode === 'over' && nextState.winner >= 0) {
        setShowWin(true);
      } else {
        setShowWin(false);
      }

      setConfirmAction(null);
    },
    [cancelObsoleteTimers, dispatch, recordStableSnapshot, setAwaitingRoll],
  );

  /* Trigger floating emoji above player's token */
  const triggerEmote = useCallback((player: number, emoji: string) => {
    const g = gs.current;
    let p = slotToIndex(player, g.players);
    if (p === -1) {
      p = Math.max(0, Math.min(g.players.length - 1, player));
    }
    const pos = g.pos[p] || 0;
    const c = pos === 0 ? (START_POS[p] || { x: 251, y: 1017 }) : squareCenter(pos);
    sfx.pop();
    if (g.emotes.length >= 10) {
      g.emotes.shift();
    }
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

    /* (P0) Do not arm the timer at all when `doRoll` would refuse.
     *
     * The effect used to arm unconditionally, so a CPU turn could be scheduled
     * while the link was down or the match was paused. `doRoll` then bailed at
     * its `isPaused` / `isOnlineMatch && !isOnline` guards, the timer was
     * consumed, and - because nothing else in the dependency list changed - the
     * bot's turn never resolved and the host's board froze until a manual
     * restart.
     *
     * Gating the arm on the same conditions means the timer is only ever
     * created for a roll that can actually happen, and the effect re-runs (both
     * values are in the dep list) the moment the block clears. */
    const { isOnlineMatch, isPaused, isOnline: onlineNow } = optionsRef.current;
    if (isPaused) return;
    if (isOnlineMatch && !onlineNow) return;

    const arm = () => {
      scheduleGameTimer('ai', cfg.aiDelayMs, 'idle', () => {
        doRoll(true);
        /* Last-resort self-heal: if `doRoll` refused for a reason this effect
         * could not anticipate, the turn would otherwise stall forever with no
         * dependency left to re-trigger us. */
        scheduleUiTimer(0, () => {
          const g = gs.current;
          if (
            g.mode === 'playing' &&
            g.phase === 'idle' &&
            !g.rolling &&
            g.players[g.turn]?.isCpu
          ) {
            arm();
          }
        });
      });
    };
    arm();
  }, [
    hud.mode,
    hud.players,
    hud.turn,
    hud.phase,
    hud.speed,
    doRoll,
    isOnline,
    isHost,
    scheduleGameTimer,
    scheduleUiTimer,
  ]);

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
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable ||
          target.closest?.('[contenteditable="true"]') ||
          target.closest?.('[role="dialog"]') ||
          target.closest?.('dialog'))
      ) {
        return;
      }
      if (typeof document !== 'undefined' && document.querySelector('[role="dialog"], dialog')) {
        return;
      }
      if (confirmAction !== null) return;

      if (e.code === 'Space' || e.code === 'Enter') {
        if (gs.current.mode === 'menu') {
          // Handled centrally in App.tsx to honor StartScreen selected settings
          return;
        }
        if (gs.current.mode === 'over') {
          // Prevent non-host winner screens from restarting through Space
          if (optionsRef.current.isOnline && !optionsRef.current.isHost) return;
          e.preventDefault();
          startRef.current(gs.current.players, gs.current.speed, gs.current.winRule);
        } else {
          e.preventDefault();
          doRollRef.current();
        }
      } else if (e.code === 'KeyM') {
        muteRef.current();
      } else if (e.code === 'KeyS') {
        // Locked during active online matches
        if (optionsRef.current.isOnline && gs.current.mode === 'playing') return;
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
  }, [confirmAction]);

  /* ---------- Resize + Board Pre-render ---------- */

  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  useEffect(() => {
    if (hud.mode === 'menu') return;
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    let touchTimer = 0;
    let resizeRaf = 0;
    let bakeRaf = 0;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const size = Math.floor(Math.min(rect.width, rect.height));
      if (size < 20) return;

      const MAX_CANVAS_PIXELS = 2048 * 2048; // 4.19M pixels maximum canvas budget
      let dpr = Math.min(2.5, window.devicePixelRatio || 1);
      if (size * dpr * size * dpr > MAX_CANVAS_PIXELS) {
        dpr = Math.sqrt(MAX_CANVAS_PIXELS) / size;
      }
      const targetPx = Math.round(size * dpr);
      const sizeChanged = sizeRef.current !== size || canvas.width !== targetPx;

      sizeRef.current = size;
      /* (P2) Assigning `canvas.width` reallocates and clears the backing store
       * even when the value is identical, so only touch it when it really
       * changed. The rAF loop reads `canvas.width` every frame; gratuitously
       * resetting it to the same number is pure work. */
      if (canvas.width !== targetPx) {
        canvas.width = targetPx;
        canvas.height = targetPx;
      }
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      ctxRef.current = canvas.getContext('2d');

      if (sizeChanged) {
        /* (P2) Coalesce re-bakes to at most one per frame.
         *
         * Each bake allocates two full-size offscreen canvases - at the pixel
         * budget that is ~16.8 MB each, ~33 MB per bake. The resize observer is
         * rAF-driven, so dragging a window edge produced a new size nearly
         * every frame and therefore ~2 GB/s of canvas backing-store churn:
         * a stuttery, garbage-heavy resize that could drop frames on a phone.
         *
         * Debouncing to one bake per frame means the *final* size is baked once
         * and the intermediate sizes are skipped entirely, which is all the
         * eye can perceive anyway. */
        if (bakeRaf) cancelAnimationFrame(bakeRaf);
        bakeRaf = requestAnimationFrame(() => {
          bakeRaf = 0;
          renderBoardLayer();
        });
      }
    };

    const debouncedResize = () => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(resize);
    };

    resize();
    const ro = new ResizeObserver(debouncedResize);
    ro.observe(wrap);

    let alive = true;
    // (F1) The board's text is *baked* into the cached board/number layers, so
    // if the webfonts land after the bake, every label stays in the fallback
    // face until the next resize. `document.fonts.ready` alone is not enough:
    // CSS-declared fonts are only fetched once something uses them, so request
    // the exact faces the canvas asks for and wait for them explicitly.
    if (document.fonts) {
      const faces = [
        '400 12.5px "Lilita One"',
        '400 12.5px "Nunito"',
        '800 12.5px "Nunito"',
        '900 12.5px "Nunito"',
      ];
      Promise.all(faces.map((f) => document.fonts.load(f).catch(() => undefined)))
        .catch(() => undefined)
        .then(() => {
          if (alive) renderBoardLayer();
        });
      if (document.fonts.ready) {
        document.fonts.ready.then(() => {
          if (alive) renderBoardLayer();
        });
      }
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

  /* (P2) Reusable per-square token occupancy, rebuilt only when a position
   * actually changes. See `tokenPoint`. */
  const occupancyCache = useRef<{
    signature: string;
    groups: Map<number, number[]>;
  }>({ signature: '', groups: new Map() });

  const occupancyFor = useCallback(
    (playerCount: number, positions: number[]): Map<number, number[]> => {
      let signature = String(playerCount);
      for (let i = 0; i < playerCount; i++) signature += `:${positions[i] ?? -1}`;
      if (occupancyCache.current.signature === signature) {
        return occupancyCache.current.groups;
      }
      const groups = new Map<number, number[]>();
      for (let i = 0; i < playerCount; i++) {
        const sq = positions[i];
        // Only positive squares matter: the start bay is laid out by
        // `START_POS` and never stacks tokens.
        if (!(sq > 0)) continue;
        const bucket = groups.get(sq);
        if (bucket) bucket.push(i);
        else groups.set(sq, [i]);
      }
      occupancyCache.current = { signature, groups };
      return groups;
    },
    [],
  );

  const tokenPoint = useCallback(
    (p: number, now: number): { x: number; y: number; hopRatio: number } => {
      const g = gs.current;
      const cfg = SPEEDS[g.speed];
      const player = g.players[p];
      const slotIndex = player ? player.slotIndex : p;
      const dockPos = START_POS[slotIndex] ?? START_POS[p % START_POS.length];

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
                  ? dockPos
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
          if (sl.kind === 'snake') {
            // (J5) Same undulation scale the renderer used this frame, so the
            // token stays welded to the body it is sliding down.
            const pt = getSnakeSlidePoint(sl.from, sl.to, f, g.time, true, snakeAmpScale());
            return { x: pt.x, y: pt.y, hopRatio: 0 };
          }
          const pt = pointAt(sl.pts, sl.cum, f * sl.total);
          return { x: pt.x, y: pt.y, hopRatio: 0 };
        }
      }

      const n = g.pos[p];
      if (!(n > 0)) return { x: dockPos.x, y: dockPos.y, hopRatio: 0 };

      const c = squareCenter(n);
      /* (P2) Share-group occupancy is recomputed once per frame into a reusable
       * buffer instead of once per player per frame.
       *
       * The old code built a fresh `sharing` array for *each* of up to 4
       * players on *each* of ~60 frames/s, and each build rescanned the whole
       * roster - so ~240 short-lived arrays and ~960 comparisons per second,
       * purely to answer "how many tokens are on my square and where am I in
       * line". The grouping only depends on `pos`, which changes a few times
       * per turn, so it is cached against the position signature. */
      const occupancy = occupancyFor(g.players.length, g.pos);
      const group = occupancy.get(n);
      const total = group ? group.length : 1;
      const slotIdx = group ? group.indexOf(p) : 0;
      const offset = getTokenSlotOffset(slotIdx < 0 ? 0 : slotIdx, total);

      return { x: c.x + offset.x, y: c.y + offset.y, hopRatio: 0 };
    },
    [],
  );

  useEffect(() => {
    if (hud.mode === 'menu') return;
    let raf = 0;
    let last = performance.now();

    const onVisibilityChange = () => {
      if (document.hidden) {
        if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
      } else {
        last = performance.now();
        if (!raf) {
          raf = requestAnimationFrame(step);
        }
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    const draw = () => {
      const canvas = canvasRef.current;
      const bLayer = boardLayer.current;
      const nLayer = numberLayer.current;
      if (!canvas || !bLayer || canvas.width < 10) return;
      const maybeCtx = ctxRef.current || canvas.getContext('2d');
      if (!maybeCtx) return;
      if (!ctxRef.current) ctxRef.current = maybeCtx;
      /* Bound to a non-null name so the hoisted `drawTokenPass` below keeps the
       * narrowing - a `const ctx` declared with a nullable inferred type loses
       * it inside a nested function declaration. */
      const ctx: CanvasRenderingContext2D = maybeCtx;
      const g = gs.current;
      const w = canvas.width;
      const s = w / LOGICAL;
      const theme = themeRef.current;

      // (J5) One read per frame. `prefersReducedMotion()` is a single
      // `matchMedia` read - microseconds, and it must not be cached because a
      // cached MediaQueryList goes stale if `matchMedia` is ever replaced.
      const reduced = prefersReducedMotion();
      const amp = reduced ? REDUCED_SNAKE_AMP : 1;

      // (E7) Shake used to be pure per-frame white noise, which reads as a
      // jitter rather than an impact. A decaying sine pair gives a punchy,
      // directional thump instead. (J5) ...and it is skipped entirely under
      // reduced motion, since moving the whole board is the definition of
      // large-area motion.
      let ox = 0;
      let oy = 0;
      if (g.shake > 0.4 && !reduced) {
        const t = g.time;
        ox = Math.sin(t * 61) * g.shake * s;
        oy = Math.cos(t * 47) * g.shake * s * 0.7;
      }

      // 1. Draw static board layer 1:1 pixel crisp with zero double-sampling blur
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bLayer, ox, oy);

      // 2. Switch to logical coordinate space for animated elements
      ctx.setTransform(s, 0, 0, s, ox, oy);

      // 3. Draw animated living snakes (slither waves, breathing, eye blinking, flicking tongue, strike reaction)
      const activeSnakeHead = g.sliding?.kind === 'snake' ? g.sliding.from : undefined;
      drawAnimatedSnakes(ctx, g.time, activeSnakeHead, theme, amp);

      // 4. Blit numbers & badges layer strictly ON TOP of the animated snakes!
      if (nLayer) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(nLayer, ox, oy);
        ctx.setTransform(s, 0, 0, s, ox, oy);
      }

      const now = g.time * 1000;
      // (P2) Via `playerPalette` so an out-of-range colorId cannot throw inside
      // the rAF loop and kill the render loop permanently.
      const activePal = playerPalette(g.turn);

      // (C5 / E6) Frame-only ambience: drifting motes and a slow light sweep.
      // Both stay on the frame by construction, so gameplay legibility is
      // never affected. (J5) Both are pure decoration, so reduced motion skips
      // them - they are always moving and never convey information.
      if (!reduced) {
        drawAmbientMotes(ctx, g.time, theme);
        drawFrameSweep(ctx, g.time, theme);
      }

      // (D6 / C6) Tie the active player to the board frame. (J5) The corner
      // studs keep their colour coding but freeze at a static alpha instead of
      // breathing, so the "whose turn" signal survives reduced motion.
      if (g.mode === 'playing') {
        drawActivePlayerEdge(ctx, activePal.base, reduced ? 0 : g.time);
        drawCornerPulse(ctx, reduced ? 0 : g.time, activePal.base, true);
      }

      // (E3) Ladder climb glow while a token is ascending a ladder.
      if (g.sliding?.kind === 'ladder') {
        const sl = g.sliding;
        drawLadderClimbGlow(
          ctx,
          sl.from,
          sl.to,
          easeInOutCubic(clamp((g.time * 1000 - sl.t0) / sl.dur, 0, 1)),
          g.time,
          theme,
        );
      }

      // Active player square pulsing highlight
      if (
        g.mode === 'playing' &&
        (g.phase === 'idle' || g.phase === 'rolling' || g.phase === 'waiting')
      ) {
        const p = g.turn;
        const n = g.pos[p];
        if (n > 0) {
          const c = squareCenter(n);
          const pal = playerPalette(p);
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
        drawTargetHighlight(ctx, g.targetSquare, activePal.base, g.time);
      }

      // Hovered square inspection highlight
      if (g.hoveredSquare && g.hoveredSquare !== g.targetSquare) {
        drawHoverHighlight(ctx, g.hoveredSquare, g.time, theme);
      }

      // Square 100 Finish Line ambient beacon + (C1/C7) ripple & winner halo
      if (g.mode === 'playing') {
        const c100 = squareCenter(100);
        const beaconAccent = theme.ui.accent;
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

        let occupant: string | null = null;
        for (let i = 0; i < g.players.length; i++) {
          if (g.pos[i] === 100) {
            occupant = playerPalette(i).base;
            break;
          }
        }
        drawPodiumPresence(ctx, g.time, occupant, theme, !reduced);
      }

      // (E4) Extra-turn halo for a rolled 6.
      if (g.extraTurn > 0) {
        const p = g.turn;
        const n = g.pos[p];
        const dockPos = START_POS[g.players[p]?.slotIndex ?? p] ?? START_POS[0];
        const ref = n > 0 ? squareCenter(n) : dockPos;
        ctx.save();
        ctx.globalAlpha = g.extraTurn * 0.8;
        ctx.strokeStyle = theme.ui.accent;
        ctx.lineWidth = 3;
        ctx.shadowColor = theme.ui.accent;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(ref.x, ref.y, 26 + (1 - g.extraTurn) * 34, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      /* (P2) Draw tokens, inactive first so the active player is on top.
       *
       * This used to allocate an array from an iterator, plus a fresh closure
       * comparator, plus the sort's own bookkeeping, on every frame - 60x per
       * second for a 4-element ordering. At most one index is out of place, so
       * walk the others forward and draw the active token last. Zero
       * allocation, same result. */
      const activeIdx = g.turn;
      for (let p = 0; p < g.players.length; p++) {
        if (p === activeIdx) continue;
        drawTokenPass(p);
      }
      if (activeIdx >= 0 && activeIdx < g.players.length) {
        drawTokenPass(activeIdx);
      }

      drawParticles(ctx, g.particles);

      // (E2) Screen-edge impact flash, drawn last so it veils the whole board.
      // (J5) Skipped under reduced motion - it is a full-screen flash, and the
      // shake + shockwave rings already carry the bite.
      if (!reduced) {
        drawImpactFlash(ctx, g.flash, g.flashColor);
      }

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

      /* Per-token draw pass. Declared as a hoisted function so both loops above
       * can share it without allocating a closure per frame. */
      function drawTokenPass(p: number) {
        const tp = tokenPoint(p, now);
        // (J5) The idle bob is a decorative float, so reduced motion holds the
        // token still. Hops and slides are untouched - they *are* the game.
        const idleBob =
          !reduced && (g.phase === 'idle' || g.phase === 'rolling' || g.phase === 'over')
            ? Math.sin(g.time * 2.6 + p * 1.5) * 2.2
            : 0;
        // (D1) Tokens parked in the start bay are drawn slightly smaller so a
        // 4-player start is not a stack of touching marbles.
        const docked = g.pos[p] <= 0 && g.moving?.player !== p && g.sliding?.player !== p;
        const baseR = 22 * (docked ? 0.82 : 1);
        const r = baseR * (1 + 0.22 * tp.hopRatio);
        const pal = playerPalette(p);
        const slotIndex = g.players[p]?.slotIndex ?? p;
        const isActive = p === g.turn && g.mode === 'playing';

        // (D2) Hop trail in the player's colour.
        if (g.moving?.player === p && tp.hopRatio > 0) {
          const m = g.moving;
          const hopMs = SPEEDS[g.speed].hopMs;
          const el = now - m.t0;
          const i = Math.min(m.steps.length - 1, Math.max(0, Math.floor(el / hopMs)));
          const f = clamp((el - i * hopMs) / hopMs, 0, 1);
          const dockPos = START_POS[slotIndex] ?? START_POS[0];
          const from =
            i === 0 ? (m.base <= 0 ? dockPos : squareCenter(m.base)) : m.steps[i - 1];
          drawHopTrail(ctx, from, { x: tp.x, y: tp.y + idleBob }, f, pal.base);
        }

        // (D3) Turn ring under the active token.
        if (isActive) {
          drawTurnRing(ctx, tp.x, tp.y + idleBob, r, g.time, pal.base);
        }

        drawToken(ctx, tp.x, tp.y + idleBob, r, pal, String(slotIndex + 1), {
          hopRatio: tp.hopRatio,
          // (D4) Emphasise the active token's number badge.
          badgeGlow: isActive ? pal.glow : undefined,
          // (D5) Cast shadow matching the snake/ladder light direction.
          castShadow: theme.board.snakeDropShadow,
        });
      }
    };

    const step = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      const g = gs.current;
      /* (P0) `g` is a snapshot: any `dispatch` below replaces `gs.current` with
         a fresh object and orphans it. Writes that must survive the frame
         therefore have to go through `dispatch` (see SET_IMPACT) or re-read
         `gs.current` after the dispatches. */
      g.time = now / 1000;
      const cfg = SPEEDS[g.speed];

      /* Hopping steps */
      if (g.moving) {
        const m = g.moving;
        const el = now - m.t0;
        if (el >= 0) {
          const idx = Math.min(m.steps.length, Math.floor(el / cfg.hopMs));
          const missedHops = idx - m.idx;
          let played = 0;
          while (m.idx < idx) {
            m.idx += 1;
            // Intermediate pos for HUD
            const curStep = m.steps[m.idx - 1];
            // Only play hop sound if not catching up excessively from a background tab
            if (missedHops <= 2 || played < 1 || m.idx === idx) {
              sfx.hop(m.idx - 1);
              played++;
            }
            spawnDust(g.particles, curStep.x, curStep.y, themeRef.current.ui.particleDust);
          }
          if (m.idx >= m.steps.length) {
            const movingPlayer = m.player;
            const target = m.finalTarget;
            const roll = m.finalRoll;
            const txId = g.txId;
            dispatch({
              type: 'FINISH_MOVE',
              txId,
              player: movingPlayer,
              target,
            });

            // (C8/B2) Themed landing rings and shockwave micro-dust for moves
            const ui = themeRef.current.ui;
            if (target > 0) {
              const landing = squareCenter(target);
              spawnRing(g.particles, landing.x, landing.y, ui.particleSpark, {
                size: 16,
                life: 0.5,
                thickness: 3,
              });
              spawnRing(g.particles, landing.x, landing.y, '#ffffff', {
                size: 8,
                life: 0.32,
                thickness: 2,
              });
              spawnDust(g.particles, landing.x, landing.y, ui.particleDust);
            }
            if (roll === 6) {
              /* (P0) Must go through `dispatch`, not `g.extraTurn = 1`. The
                 `FINISH_MOVE` dispatch above replaced `gs.current` with a
                 fresh object, so `g` is an orphan and the halo never drew. */
              dispatch({ type: 'SET_IMPACT', extraTurn: 1 });
            }

            afterMove(movingPlayer, target, roll, txId);
          }
        }
      }

      /* Sliding down snakes / up ladders */
      if (g.sliding) {
        const sl = g.sliding;
        const f = (now - sl.t0) / sl.dur;
        if (f >= 1) {
          const slidingPlayer = sl.player;
          const to = sl.to;
          const roll = sl.roll;
          const txId = g.txId;
          dispatch({
            type: 'FINISH_SLIDE',
            txId,
            player: slidingPlayer,
            to,
          });
          const ui = themeRef.current.ui;
          if (sl.kind === 'snake') {
            /* (P0) Same orphaned-state trap as the extra-turn halo above: the
               `FINISH_SLIDE` dispatch replaced `gs.current`, so these three
               writes used to be discarded and the shake / flash were dead. */
            dispatch({
              type: 'SET_IMPACT',
              shake: 14,
              flash: 1,
              flashColor: 'rgba(239, 68, 68, 0.55)',
            });
            sfx.hit();
            const c = squareCenter(sl.to);
            spawnDust(g.particles, c.x, c.y, ui.particleDust);
            for (let i = 0; i < 9; i++) spawnSpark(g.particles, c.x, c.y, ui.particleSnakeSpark);
            spawnRing(g.particles, c.x, c.y, ui.particleSnakeSpark, {
              size: 16,
              life: 0.5,
              thickness: 3.5,
            });
            spawnRing(g.particles, c.x, c.y, '#ffffff', { size: 8, life: 0.34, thickness: 2.5 });
          } else {
            sfx.ding();
            const c = squareCenter(sl.to);
            for (let i = 0; i < 9; i++) spawnSpark(g.particles, c.x, c.y, ui.particleLadderSpark);
            spawnRing(g.particles, c.x, c.y, ui.particleLadderSpark, {
              size: 18,
              life: 0.6,
              thickness: 3,
            });
          }
          finishTurn(slidingPlayer, roll, txId);
        } else if (f > 0) {
          const f2 = easeInOutCubic(clamp(f, 0, 1));
          // (J5) Matches the renderer + tokenPoint for this frame.
          const pt = sl.kind === 'snake'
            ? getSnakeSlidePoint(sl.from, sl.to, f2, g.time, true, snakeAmpScale())
            : pointAt(sl.pts, sl.cum, f2 * sl.total);
          const ui = themeRef.current.ui;
          if (sl.kind === 'ladder') {
            // (B4) Ladder climb sparkle trail
            if (Math.random() < 0.6) {
              spawnSpark(g.particles, pt.x, pt.y, ui.particleLadderSpark);
            }
          } else {
            // (B4) Snake slide friction dust and sparks
            if (Math.random() < 0.45) {
              spawnSpark(g.particles, pt.x, pt.y, ui.particleSnakeSpark);
            }
            if (Math.random() < 0.35) {
              spawnDust(g.particles, pt.x, pt.y, ui.particleDust);
            }
          }
        }
      }

      // Bound particles to avoid unbounded memory growth (elevated during win celebration)
      const maxParticles = g.phase === 'over' || g.mode === 'over' ? 180 : 75;
      if (g.particles.length > maxParticles) {
        g.particles.splice(0, g.particles.length - maxParticles);
      }
      updateParticles(g.particles, dt / 1000);

      // Bound and update floating emotes
      if (g.emotes.length > 10) {
        g.emotes.splice(0, g.emotes.length - 10);
      }
      for (let i = g.emotes.length - 1; i >= 0; i--) {
        const em = g.emotes[i];
        em.life -= dt / 1000;
        em.y += em.vy * (dt / 1000);
        if (em.life <= 0) {
          g.emotes.splice(i, 1);
        }
      }

      // (P0) Re-read live state: a `dispatch` above may have replaced it, in
      // which case decaying the orphaned snapshot would silently drop the
      // decay and leave the effect pinned for a frame.
      const live = gs.current;
      live.time = now / 1000;
      live.shake *= Math.pow(0.88, dt / 16.7);
      if (live.shake < 0.4) live.shake = 0;

      // (E2 / E4) Impact flash and extra-turn halo decay like the shake does.
      live.flash *= Math.pow(0.86, dt / 16.7);
      if (live.flash < 0.01) live.flash = 0;
      live.extraTurn *= Math.pow(0.9, dt / 16.7);
      if (live.extraTurn < 0.01) live.extraTurn = 0;

      draw();

      if (!document.hidden && gs.current.mode !== 'menu') {
        raf = requestAnimationFrame(step);
      }
    };

    raf = requestAnimationFrame(step);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [afterMove, dispatch, finishTurn, hud.mode, tokenPoint]);

  const canRoll: boolean =
    hud.mode === 'playing' &&
    (hud.phase === 'idle' || (hud.phase === 'rolling' && !activeTimers.current.has('roll'))) &&
    (!hud.rolling || !activeTimers.current.has('roll')) &&
    !awaitingRemoteRoll &&
    !optionsRef.current.isPaused &&
    (!optionsRef.current.isOnlineMatch || !!optionsRef.current.isOnline) &&
    (isOnline ? hud.players[hud.turn]?.slotIndex === onlineSlot : true) &&
    !hud.players[hud.turn]?.isCpu;

  const requestRestart = useCallback(() => {
    clearHover();
    if (hud.mode === 'playing') {
      setConfirmAction('restart');
    } else {
      startGame(hud.players, hud.speed, hud.winRule);
    }
  }, [clearHover, hud.mode, hud.players, hud.speed, hud.winRule, startGame]);

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

  const getSnapshot = useCallback((): GameStateSnapshot => {
    const s = gs.current;
    if (lastStableSnapshot.current && isNonStablePhase(s.phase)) {
      return { ...lastStableSnapshot.current };
    }

    const checkpointMode: CheckpointMode =
      s.winner >= 0 || s.mode === 'over'
        ? 'over'
        : s.mode === 'playing'
        ? 'playing'
        : 'idle';

    const stablePhase = s.winner >= 0 || s.mode === 'over' ? 'over' : 'idle';

    return {
      mode: checkpointMode,
      pos: [...s.pos],
      turn: s.turn,
      phase: isStablePhase(s.phase) ? s.phase : stablePhase,
      rolls: [...s.rolls],
      laddersHit: [...s.laddersHit],
      snakesHit: [...s.snakesHit],
      sixesHit: [...s.sixesHit],
      winner: s.winner,
      isPlaying: s.mode === 'playing',
    };
  }, []);

  const updatePlayers = useCallback((players: PlayerConfig[]) => {
    dispatch({ type: 'UPDATE_PLAYERS', players });
  }, [dispatch]);

  const cpuTakeover = useCallback((slotIndex: number, name?: string) => {
    dispatch({ type: 'CPU_TAKEOVER', slotIndex, name });
  }, [dispatch]);

  const reconnectPlayer = useCallback((slotIndex: number, name?: string) => {
    dispatch({ type: 'PLAYER_RECONNECT', slotIndex, name });
  }, [dispatch]);

  const removePlayer = useCallback((slotIndex: number) => {
    dispatch({ type: 'REMOVE_PLAYER', slotIndex });
  }, [dispatch]);

  const getSlotRosterIndex = useCallback((slotIndex: number) => {
    return slotToIndex(slotIndex, gs.current.players);
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
    awaitingRemoteRoll,
    confirmAction,
    hoveredSquare,
    theme: THEMES[themeId] || THEMES.jungle,
    themeId,
    setTheme,
    playerName,
    playerPalette,
    startGame,
    reconnectGame,
    updatePlayers,
    cpuTakeover,
    reconnectPlayer,
    removePlayer,
    getSlotRosterIndex,
    getRollAuthority,
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
    /**
     * (P0) Release the guest's "waiting for the host's roll" latch.
     *
     * Wired to the multiplayer layer's ROLL_REJECTED handler. Without this a
     * host-side refusal left `awaitingRemoteRoll` stuck true, `canRoll` false,
     * and the roll button permanently dead for the rest of the match.
     */
    releaseRollRequest: () => setAwaitingRoll(false),
  };
}

